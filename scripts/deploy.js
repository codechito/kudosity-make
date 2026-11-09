#!/usr/bin/env node
'use strict';

/**
 * Deploy the Make custom app from this repo via the Make API (SAL-116).
 *
 *   MAKE_ZONE=us1 node scripts/deploy.js            # plan only (no changes)
 *   MAKE_ZONE=us1 node scripts/deploy.js --apply    # create / update in Make
 *   MAKE_ZONE=us1 node scripts/deploy.js --inspect  # read-only: compare the app in Make with this repo
 *   ... --apply --no-functions  skip IML functions (Make enables them per account via support) and
 *                               swap kudosityError(...) for a plain error message at upload time
 *   ... --apply --prune    also delete modules, webhooks, connections and functions not in make-app.json
 *
 * Idempotent: components are matched by name (functions, modules) or label
 * (connections, webhooks), created when missing and their sections overwritten.
 * Make's generated names for connections and webhooks are cached in
 * .make/state-<app>.json (gitignored).
 *
 * MAKE_APP_NAME overrides app.name from make-app.json.
 * Token: MAKE_TOKEN_FILE (default ~/make-api-token.txt), scopes sdk-apps:read + sdk-apps:write.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
// One state file per app, so deploying a different app never reuses another app's connection names.
const stateFile = (app) => path.join(ROOT, '.make', `state-${app}.json`);
const TYPE_IDS = { action: 4, search: 9, instant: 10, universal: 12 };
const CONNECTION_SECTIONS = ['api', 'parameters'];
const WEBHOOK_SECTIONS = ['api', 'parameters', 'attach', 'detach'];
// Repo file -> Make module section. Module fields live in parameters.imljson but belong in Make's
// "expect" (mappable parameters); Make's "parameters" (static, not mappable) is reset to [].
// Instant triggers get their output from the webhook, so they only carry interface and samples.
const MODULE_FILES = {
    default: [{ file: 'api', section: 'api' }, { file: 'parameters', section: 'expect' }, { file: 'interface', section: 'interface' },
        { file: 'samples', section: 'samples', optional: true }],
    instant: [{ file: 'interface', section: 'interface' }, { file: 'samples', section: 'samples', optional: true }],
};

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

// Used with --no-functions: the API's own message, without kudosityError's remedies.
const FALLBACK_ERROR = "[{{statusCode}}] {{ifempty(body.error.description, body.error.detail, body.error.message, body.status, body.message, body.error, 'The request to Kudosity failed')}}{{if(body.error.issues, ': ' + join(map(body.error.issues, 'name'), ', ') + ' - ' + join(map(body.error.issues, 'message'), '; '), '')}}";
function withoutFunctions(text) {
    return text.replace(/\{\{kudosityError\([^)]*\)\}\}/g, FALLBACK_ERROR);
}
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));

function loadManifest() {
    const manifest = JSON.parse(read('make-app.json'));
    // MAKE_APP_NAME points the deploy at an existing app (Make app names are global, so ours may differ).
    if (process.env.MAKE_APP_NAME) manifest.app.name = process.env.MAKE_APP_NAME;
    return manifest;
}

/** Pure: everything the deploy will upload, with files checked. Throws on gaps. */
function buildPlan(manifest = loadManifest()) {
    const steps = [];
    const missing = [];
    const need = (rel) => { if (!exists(rel)) missing.push(rel); return rel; };

    steps.push({ kind: 'app', name: manifest.app.name });
    if (manifest.app.icon) steps.push({ kind: 'icon', file: need(manifest.app.icon) });
    for (const f of manifest.functions) steps.push({ kind: 'function', name: f.name, file: need(f.code) });
    steps.push({ kind: 'base', file: need(manifest.base) });
    if (manifest.app.readme) steps.push({ kind: 'readme', file: need(manifest.app.readme) });
    for (const c of manifest.connections) {
        steps.push({ kind: 'connection', key: c.key, label: c.label, type: c.type,
            sections: CONNECTION_SECTIONS.map((s) => ({ section: s, file: need(`${c.dir}/${s}.imljson`) })) });
    }
    const connKeys = new Set(manifest.connections.map((c) => c.key));
    for (const w of manifest.webhooks) {
        if (!connKeys.has(w.connection)) missing.push(`webhook ${w.key}: unknown connection ${w.connection}`);
        steps.push({ kind: 'webhook', key: w.key, label: w.label, type: w.type, connection: w.connection,
            sections: WEBHOOK_SECTIONS.map((s) => ({ section: s, file: need(`${w.dir}/${s}.imljson`) })) });
    }
    const hookKeys = new Set(manifest.webhooks.map((w) => w.key));
    for (const m of manifest.modules) {
        if (!TYPE_IDS[m.type]) missing.push(`module ${m.name}: unknown type ${m.type}`);
        if (!connKeys.has(m.connection)) missing.push(`module ${m.name}: unknown connection ${m.connection}`);
        if (m.webhook && !hookKeys.has(m.webhook)) missing.push(`module ${m.name}: unknown webhook ${m.webhook}`);
        const sections = (MODULE_FILES[m.type] || MODULE_FILES.default)
            .filter((f) => !f.optional || exists(`modules/${m.name}/${f.file}.imljson`))
            .map((f) => ({ section: f.section, file: need(`modules/${m.name}/${f.file}.imljson`) }));
        if (m.type !== 'instant') sections.push({ section: 'parameters', text: '[]' });
        steps.push({ kind: 'module', name: m.name, label: m.label, description: m.description,
            typeId: TYPE_IDS[m.type], connection: m.connection, webhook: m.webhook || null, sections });
    }
    // Every module folder on disk must be in the manifest, so nothing is silently left out.
    const declared = new Set(manifest.modules.map((m) => m.name));
    for (const dir of fs.readdirSync(path.join(ROOT, 'modules'))) {
        if (!declared.has(dir)) missing.push(`modules/${dir} is not in make-app.json`);
    }
    if (missing.length) {
        const e = new Error('Manifest problems:\n  - ' + missing.join('\n  - '));
        e.missing = missing;
        throw e;
    }
    return steps;
}

function loadState(app) {
    try { return JSON.parse(fs.readFileSync(stateFile(app), 'utf8')); } catch (_) { return { connections: {}, webhooks: {} }; }
}
function saveState(app, state) {
    fs.mkdirSync(path.dirname(stateFile(app)), { recursive: true });
    fs.writeFileSync(stateFile(app), JSON.stringify(state, null, 2));
}

const listOf = (res, key) => (Array.isArray(res) ? res : (res && (res[key] || res.items))) || [];

async function apply(client, manifest, steps, log = console.log, { noFunctions = false } = {}) {
    const { name, version } = manifest.app;
    const app = `/sdk/apps/${name}/${version}`;
    const state = loadState(manifest.app.name);
    const putJsonc = (p, rel, text = read(rel)) => client.request('PUT', p, {
        text: noFunctions ? withoutFunctions(text) : text, contentType: 'application/jsonc' });

    for (const step of steps) {
        if (noFunctions && step.kind === 'function') { log(`function ${step.name}: skipped (--no-functions)`); continue; }
        if (step.kind === 'app') {
            // Make answers 403 for both "not found" and "not yours", so check our own app list.
            const mine = listOf(await client.request('GET', '/sdk/apps'), 'apps').some((a) => a.name === name && a.version === version);
            if (mine) {
                const { label, description, theme } = manifest.app;
                await client.request('PATCH', app, { json: { label, description, theme } });
                log(`app ${name}@${version}: exists, details updated`);
            } else {
                const { label, description, theme, language, countries } = manifest.app;
                const created = await client.request('POST', '/sdk/apps', { json: { name, label, description, theme, language, countries } });
                const got = (created.app || created).name;
                // Make may not keep the requested name; stop rather than deploy into the wrong path.
                if (got && got !== name) throw new Error(`Make created the app as "${got}", not "${name}". Set app.name in make-app.json to "${got}" and run again.`);
                log(`app ${name}@${version}: created (private)`);
            }
        } else if (step.kind === 'function') {
            const fns = listOf(await client.request('GET', `${app}/functions`), 'appFunctions').map((f) => f.name);
            if (!fns.includes(step.name)) {
                await client.request('POST', `${app}/functions`, { json: { name: step.name } });
            }
            await client.request('PUT', `${app}/functions/${step.name}/code`, { text: read(step.file), contentType: 'application/javascript' });
            log(`function ${step.name}: ${fns.includes(step.name) ? 'updated' : 'created'}`);
        } else if (step.kind === 'icon') {
            await client.request('PUT', `${app}/icon`, { text: fs.readFileSync(path.join(ROOT, step.file)), contentType: 'image/png' });
            log('icon: updated');
        } else if (step.kind === 'base') {
            await putJsonc(`${app}/base`, step.file);
            log('base: updated');
        } else if (step.kind === 'readme') {
            await client.request('PUT', `${app}/readme`, { text: read(step.file), contentType: 'text/markdown' });
            log('readme: updated');
        } else if (step.kind === 'connection' || step.kind === 'webhook') {
            const plural = step.kind === 'connection' ? 'connections' : 'webhooks';
            let id = state[plural][step.key];
            if (!id) {
                const existing = listOf(await client.request('GET', `/sdk/apps/${name}/${plural}`), `app${plural[0].toUpperCase()}${plural.slice(1)}`)
                    .find((x) => x.label === step.label);
                if (existing) id = existing.name;
            }
            if (!id) {
                const body = { type: step.type, label: step.label };
                if (step.kind === 'webhook') body.connection = state.connections[step.connection];
                const created = await client.request('POST', `/sdk/apps/${name}/${plural}`, { json: body });
                id = (created[step.kind === 'connection' ? 'appConnection' : 'appWebhook'] || created).name;
                log(`${step.kind} ${step.label}: created as ${id}`);
            } else {
                if (step.kind === 'webhook') {
                    await client.request('PATCH', `/sdk/apps/${plural}/${id}`, { json: { label: step.label, connection: state.connections[step.connection] } });
                }
                log(`${step.kind} ${step.label}: exists as ${id}`);
            }
            state[plural][step.key] = id;
            saveState(name, state);
            for (const s of step.sections) await putJsonc(`/sdk/apps/${plural}/${id}/${s.section}`, s.file);
        } else if (step.kind === 'module') {
            const existing = listOf(await client.request('GET', `${app}/modules`), 'appModules').find((m) => m.name === step.name);
            const connection = state.connections[step.connection];
            const webhook = step.webhook ? state.webhooks[step.webhook] : undefined;
            if (existing && existing.typeId !== undefined && existing.typeId !== step.typeId) {
                // Make can't change a module's type in place; recreate it (only possible while the app is private).
                await client.request('DELETE', `${app}/modules/${step.name}`);
                log(`module ${step.name}: type ${existing.typeId} -> ${step.typeId}, recreating`);
            }
            if (!existing || (existing.typeId !== undefined && existing.typeId !== step.typeId)) {
                await client.request('POST', `${app}/modules`, { json: {
                    name: step.name, typeId: step.typeId, label: step.label, description: step.description,
                    connection, ...(webhook ? { webhook } : {}) } });
                log(`module ${step.name}: created`);
            } else {
                await client.request('PATCH', `${app}/modules/${step.name}`, { json: { label: step.label, description: step.description, connection } });
                log(`module ${step.name}: updated`);
            }
            for (const s of step.sections) await putJsonc(`${app}/modules/${step.name}/${s.section}`, s.file, s.text);
        }
    }
    return state;
}

/**
 * Read-only. What exists in Make that this repo does not declare.
 * Connections and webhooks count as ours if their name is in state or their label is in the manifest.
 */
async function findExtras(client, manifest) {
    const { name, version } = manifest.app;
    const app = `/sdk/apps/${name}/${version}`;
    const state = loadState(manifest.app.name);
    const ours = (kind, list) => new Set([...Object.values(state[kind] || {}), ...list]);
    const modules = listOf(await client.request('GET', `${app}/modules`), 'appModules');
    const functions = listOf(await client.request('GET', `${app}/functions`), 'appFunctions');
    const connections = listOf(await client.request('GET', `/sdk/apps/${name}/connections`), 'appConnections');
    const webhooks = listOf(await client.request('GET', `/sdk/apps/${name}/webhooks`), 'appWebhooks');
    const modNames = new Set(manifest.modules.map((m) => m.name));
    const fnNames = new Set(manifest.functions.map((f) => f.name));
    const connLabels = new Set(manifest.connections.map((c) => c.label));
    const hookLabels = new Set(manifest.webhooks.map((w) => w.label));
    const connOurs = ours('connections', []);
    const hookOurs = ours('webhooks', []);
    // Only the first connection/webhook with a declared label is ours; later duplicates are extras.
    const firstByLabel = (items, labels, owned) => {
        const seen = new Set();
        return items.filter((x) => {
            if (owned.has(x.name)) { seen.add(x.label); return false; }
            return true;
        }).filter((x) => {
            if (labels.has(x.label) && !seen.has(x.label)) { seen.add(x.label); return false; }
            return true;
        });
    };
    return {
        existing: { modules, functions, connections, webhooks },
        modules: modules.filter((m) => !modNames.has(m.name)),
        functions: functions.filter((f) => !fnNames.has(f.name)),
        connections: firstByLabel(connections, connLabels, connOurs),
        webhooks: firstByLabel(webhooks, hookLabels, hookOurs),
    };
}

/**
 * Deletes extras. Modules first (they use webhooks and connections), then webhooks, connections, functions.
 * Make refuses (422) to delete anything a scenario or user connection still uses; those are reported
 * in `blocked` and the rest still go.
 */
async function prune(client, manifest, log = console.log) {
    const { name, version } = manifest.app;
    const app = `/sdk/apps/${name}/${version}`;
    const extra = await findExtras(client, manifest);
    const blocked = [];
    const del = async (p, what) => {
        try { await client.request('DELETE', p); log(`pruned ${what}`); }
        catch (e) { if (e.status !== 422 && !(e.status === 400 && /public app|is used by/i.test(e.message))) throw e; blocked.push(what); log(`kept ${what}: ${e.message.split(': ').pop()}`); }
    };
    for (const m of extra.modules) await del(`${app}/modules/${m.name}`, `module ${m.name}`);
    for (const w of extra.webhooks) await del(`/sdk/apps/webhooks/${w.name}`, `webhook ${w.label} (${w.name})`);
    for (const c of extra.connections) await del(`/sdk/apps/connections/${c.name}`, `connection ${c.label} (${c.name})`);
    for (const f of extra.functions) await del(`${app}/functions/${f.name}`, `function ${f.name}`);
    if (blocked.length) log(`\n${blocked.length} item(s) could not be deleted: Make keeps items that a scenario or connection still uses, and does not delete webhooks from public apps.`);
    return { ...extra, blocked };
}

async function inspect(client, manifest) {
    const { name, version } = manifest.app;
    const apps = listOf(await client.request('GET', '/sdk/apps'), 'apps');
    if (!apps.some((a) => a.name === name && a.version === version)) {
        console.log(`No app named "${name}" v${version} in your Make organisation, so --apply would create it.`);
        if (apps.length) {
            console.log('Your custom apps (set app.name in make-app.json to overwrite one):');
            for (const a of apps) console.log(`  ${a.name}  v${a.version}  "${a.label}"`);
        }
        return;
    }
    const extra = await findExtras(client, manifest);
    const have = new Set(extra.existing.modules.map((m) => m.name));
    const haveConn = new Set(extra.existing.connections.map((c) => c.label));
    const haveHook = new Set(extra.existing.webhooks.map((w) => w.label));
    console.log(`App ${name} v${version} exists in Make.`);
    console.log('Modules:');
    for (const m of manifest.modules) console.log(`  ${have.has(m.name) ? 'overwrite' : 'create   '} ${m.name}`);
    for (const m of extra.modules) console.log(`  extra     ${m.name}${m.label ? ` "${m.label}"` : ''}`);
    console.log('Connections:');
    for (const c of manifest.connections) console.log(`  ${haveConn.has(c.label) ? 'overwrite' : 'create   '} ${c.label}`);
    for (const c of extra.connections) console.log(`  extra     ${c.label} (${c.name})`);
    console.log('Webhooks:');
    for (const w of manifest.webhooks) console.log(`  ${haveHook.has(w.label) ? 'overwrite' : 'create   '} ${w.label}`);
    for (const w of extra.webhooks) console.log(`  extra     ${w.label} (${w.name})`);
    console.log('Functions:');
    const haveFn = new Set(extra.existing.functions.map((f) => f.name));
    for (const f of manifest.functions) console.log(`  ${haveFn.has(f.name) ? 'overwrite' : 'create   '} ${f.name}`);
    for (const f of extra.functions) console.log(`  extra     ${f.name}`);
    console.log('\n"extra" items are left alone by --apply and deleted by --apply --prune.');
}

async function main() {
    const manifest = loadManifest();
    const steps = buildPlan(manifest);
    const counts = steps.reduce((a, s) => ((a[s.kind] = (a[s.kind] || 0) + 1), a), {});
    console.log(`Plan for ${manifest.app.name}@${manifest.app.version}:`, JSON.stringify(counts));
    if (process.argv.includes('--inspect')) {
        const { createClient } = require('./lib/make-client');
        await inspect(createClient(), manifest);
        return;
    }
    if (process.argv.includes('--prune') && !process.argv.includes('--apply')) {
        throw new Error('--prune deletes things in Make; use it with --apply (run --inspect first to see what it would delete).');
    }
    if (!process.argv.includes('--apply')) {
        for (const s of steps) {
            const what = s.name || s.label || s.file;
            const extra = s.sections ? ` [${s.sections.filter((x) => x.file).map((x) => x.section).join(', ')}]` : '';
            console.log(`  ${s.kind.padEnd(10)} ${what}${extra}${s.connection ? ` (connection: ${s.connection})` : ''}${s.webhook ? ` (webhook: ${s.webhook})` : ''}`);
        }
        console.log('\nDry run only. Re-run with --apply to deploy (needs MAKE_ZONE and the token file).');
        return;
    }
    const { createClient } = require('./lib/make-client');
    const client = createClient();
    await apply(client, manifest, steps, console.log, { noFunctions: process.argv.includes('--no-functions') });
    if (process.argv.includes('--prune')) await prune(client, manifest);
    console.log('deployed');
}

if (require.main === module) {
    main().catch((e) => { console.error(e.message); process.exit(1); });
}

module.exports = { buildPlan, apply, withoutFunctions, prune, findExtras, inspect, loadManifest, TYPE_IDS };
