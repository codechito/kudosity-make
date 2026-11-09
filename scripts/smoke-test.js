#!/usr/bin/env node
'use strict';

/**
 * Smoke-test the deployed Make app by running real one-module scenarios (SAL-99 / SAL-100).
 *
 * One-time setup (learn):
 *   In Make, build a scenario by hand with one V1 module (e.g. Get Account Details (V1))
 *   and one V2 module (e.g. Send an SMS), each on a Kudosity connection. Don't run it. Then:
 *     MAKE_ZONE=us1 node scripts/smoke-test.js --learn <scenarioId>
 *   This reads the blueprint and saves how Make names the app's modules, the module
 *   version, and the two connection IDs to .make/learned.json (gitignored). No secrets.
 *
 * Run:
 *   MAKE_ZONE=us1 MAKE_TEAM_ID=123 node scripts/smoke-test.js           # read-only modules
 *   MAKE_ZONE=us1 MAKE_TEAM_ID=123 node scripts/smoke-test.js --send    # also sends real SMS
 *   ... --only v1GetAccount,v1FormatNumber    run a subset
 *   ... --keep                                 leave scenarios in Make for debugging
 *
 * Each case: create scenario -> activate -> run (waits up to 40s) -> check status -> delete.
 * --send needs KUDOSITY_TEST_RECIPIENT and KUDOSITY_TEST_SENDER, in the environment or
 * in KUDOSITY_TEST_ENV (default ~/kudosity-make-test.env, KEY=value lines).
 *
 * Token: MAKE_TOKEN_FILE (default ~/make-api-token.txt), scopes scenarios:read/write/run, connections:read.
 * Instant triggers (Watch Events, Watch Inbound SMS) are not covered: they need an inbound webhook.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const LEARNED_FILE = path.join(ROOT, '.make', 'learned.json');
const STATUS = { 1: 'success', 2: 'warning', 3: 'error' };

/** Cases. `send: true` costs money and messages a real phone, so it only runs with --send. */
function cases(env = {}) {
    const to = env.KUDOSITY_TEST_RECIPIENT;
    const from = env.KUDOSITY_TEST_SENDER;
    const inOneDay = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    return [
        { module: 'v1GetAccount', mapper: {} },
        { module: 'v1GetSenderIds', mapper: {} },
        { module: 'v1GetNumbers', mapper: { filter: 'owned', limit: 5 } },
        { module: 'v1MakeApiCall', mapper: { url: '/get-balance.json', method: 'GET' } },
        { module: 'v2MakeApiCall', mapper: { url: '/sms', method: 'GET', qs: [{ key: 'limit', value: '1' }] } },
        { module: 'v1FormatNumber', mapper: { msisdn: '0412345678', countrycode: 'AU' } },
        // Sends. Later steps map the message ID from step 1, which also proves the send's output interface.
        { name: 'v1SmsLifecycle', send: true, steps: [
            { module: 'v1SendSms', mapper: { to: to, from: from, message: 'Kudosity Make test (V1 SMS). Reply to test inbound.' } },
            { module: 'v1GetDeliveryStatus', mapper: { message_id: '{{1.message_id}}', msisdn: to } },
            { module: 'v1GetReplies', mapper: { message_id: '{{1.message_id}}', limit: 5 } }] },
        { name: 'v1ScheduleThenCancel', send: true, steps: [
            { module: 'v1SendSms', mapper: { to: to, from: from, message: 'Kudosity Make test (scheduled, should be cancelled).', send_at: inOneDay } },
            { module: 'v1CancelSms', mapper: { id: '{{1.message_id}}' } }] },
        { module: 'v2SendSms', send: true, mapper: { recipient: to, sender: from, message: 'Kudosity Make test (V2 SMS)', message_ref: 'make-test' } },
        { module: 'v2SendMms', send: true, mapper: { recipient: to, sender: from, subject: 'Kudosity Make test', message: 'Kudosity Make test (V2 MMS)',
            content_urls: ['https://www.gstatic.com/webp/gallery/1.jpg'], message_ref: 'make-test' } },
        { module: 'v2SendWhatsApp', send: true, mapper: { recipient: to, sender: from, content_type: 'text', message: 'Kudosity Make test (WhatsApp)', message_ref: 'make-test' } },
        { module: 'v2SendRcs', send: true, mapper: { recipient: to, sender: from, content_type: 'text', message: 'Kudosity Make test (RCS)', message_ref: 'make-test' } },
    ];
}

function loadManifest() {
    return JSON.parse(fs.readFileSync(path.join(ROOT, 'make-app.json'), 'utf8'));
}

/** Reads KEY=value lines; ignores blanks and # comments. Never logs values. */
function loadEnvFile(file) {
    if (!file || !fs.existsSync(file)) return {};
    const out = {};
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
        if (m) out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
    }
    return out;
}

/**
 * Pure: from a hand-made scenario's blueprint, work out how Make refers to this app.
 * Module refs look like "<prefix>:<moduleName>"; the connection is a parameter holding its ID.
 */
function learnFromBlueprint(blueprint, manifest) {
    const byName = new Map(manifest.modules.map((m) => [m.name, m]));
    const found = { modulePrefix: null, moduleVersion: null, connectionParam: null, connections: {} };
    const walk = (flow) => {
        for (const node of flow || []) {
            if (node.routes) for (const r of node.routes) walk(r.flow);
            if (typeof node.module !== 'string') continue;
            const i = node.module.lastIndexOf(':');
            const name = node.module.slice(i + 1);
            const mod = byName.get(name);
            if (i < 0 || !mod) continue;
            found.modulePrefix = found.modulePrefix || node.module.slice(0, i);
            found.moduleVersion = found.moduleVersion || node.version || 1;
            const params = node.parameters || {};
            const key = Object.keys(params).find((k) => /^__IMTCONN/.test(k)) ||
                Object.keys(params).find((k) => typeof params[k] === 'number');
            if (key) {
                found.connectionParam = found.connectionParam || key;
                found.connections[mod.connection] = params[key];
            }
        }
    };
    const bp = typeof blueprint === 'string' ? JSON.parse(blueprint) : blueprint;
    walk(bp.flow);
    if (!found.modulePrefix) throw new Error('No Kudosity modules found in that scenario. Add a V1 and a V2 Kudosity module and try again.');
    return found;
}

/** Pure: a one-module, on-demand scenario blueprint. */
function buildBlueprint(learned, moduleName, connectionKey, mapper) {
    return buildFlow(learned, [{ module: moduleName, connection: connectionKey, mapper }], `smoke-test ${moduleName}`);
}

/** Pure: an on-demand scenario running steps in order; a step's mapper may use {{1.field}} from earlier steps. */
function buildFlow(learned, steps, name) {
    return {
        name: `${name} ${new Date().toISOString()}`,
        flow: steps.map((step, i) => {
            const connectionId = learned.connections[step.connection];
            if (!connectionId) throw new Error(`No ${step.connection} connection learned. Re-run --learn with a scenario that has a ${step.connection.toUpperCase()} module.`);
            return {
                id: i + 1,
                module: `${learned.modulePrefix}:${step.module}`,
                version: learned.moduleVersion || 1,
                parameters: { [learned.connectionParam || '__IMTCONN__']: connectionId },
                mapper: step.mapper,
                metadata: { designer: { x: i * 300, y: 0 } },
            };
        }),
        metadata: {
            instant: false,
            version: 1,
            scenario: { roundtrips: 1, maxErrors: 1, autoCommit: true, autoCommitTriggerLast: true, sequential: false, confidential: false, dataloss: false, dlq: false },
            designer: { orphans: [] },
        },
    };
}

/** Runs one case end to end. Always deletes the scenario unless keep is set. */
async function runCase(client, { teamId, learned, manifest, testCase, keep = false }) {
    const steps = (testCase.steps || [{ module: testCase.module, mapper: testCase.mapper }]).map((step) => {
        const mod = manifest.modules.find((m) => m.name === step.module);
        if (!mod) throw new Error(`${step.module} is not in make-app.json`);
        return { ...step, connection: mod.connection };
    });
    const label = testCase.name || testCase.module;
    const blueprint = buildFlow(learned, steps, `smoke-test ${label}`);
    const created = await client.request('POST', '/scenarios', { query: { confirmed: 'true' }, json: {
        teamId: Number(teamId), blueprint: JSON.stringify(blueprint), scheduling: JSON.stringify({ type: 'on-demand' }) } });
    const id = (created.scenario || created).id;
    const result = { module: label, scenarioId: id };
    try {
        await client.request('POST', `/scenarios/${id}/start`);
        const run = await client.request('POST', `/scenarios/${id}/run`, { json: { responsive: true } });
        result.executionId = run.executionId;
        result.status = STATUS[run.status] || (run.status === undefined ? 'unknown' : String(run.status));
        result.ok = run.status === 1;
    } catch (e) {
        result.ok = false;
        result.status = 'error';
        result.error = e.message;
    } finally {
        if (!keep) {
            try { await client.request('POST', `/scenarios/${id}/stop`); } catch (_) { /* may not be active */ }
            try { await client.request('DELETE', `/scenarios/${id}`, { query: { confirmed: 'true' } }); } catch (e) { result.cleanup = e.message; }
        }
    }
    return result;
}

function arg(name) {
    const i = process.argv.indexOf(name);
    return i > -1 ? process.argv[i + 1] : undefined;
}

async function main() {
    const { createClient } = require('./lib/make-client');
    const manifest = loadManifest();
    const client = createClient();

    const learnId = arg('--learn');
    if (learnId) {
        const res = await client.request('GET', `/scenarios/${learnId}/blueprint`);
        const learned = learnFromBlueprint((res.response || res).blueprint || res, manifest);
        fs.mkdirSync(path.dirname(LEARNED_FILE), { recursive: true });
        fs.writeFileSync(LEARNED_FILE, JSON.stringify({ ...learned, learnedFrom: Number(learnId), at: new Date().toISOString() }, null, 2));
        console.log(`Learned from scenario ${learnId}: modules are "${learned.modulePrefix}:<name>" v${learned.moduleVersion}; connections ${JSON.stringify(learned.connections)}`);
        for (const key of ['v1', 'v2']) if (!learned.connections[key]) console.log(`  warning: no ${key} module in that scenario, so ${key} cases will fail`);
        return;
    }

    const teamId = process.env.MAKE_TEAM_ID;
    if (!teamId) throw new Error('Set MAKE_TEAM_ID (Make: Team > the number in the address bar).');
    if (!fs.existsSync(LEARNED_FILE)) throw new Error('Run --learn <scenarioId> first (see the top of this file).');
    const learned = JSON.parse(fs.readFileSync(LEARNED_FILE, 'utf8'));

    const send = process.argv.includes('--send');
    const env = { ...loadEnvFile(process.env.KUDOSITY_TEST_ENV || path.join(os.homedir(), 'kudosity-make-test.env')), ...process.env };
    const only = arg('--only') ? new Set(arg('--only').split(',')) : null;
    let todo = cases(env).filter((c) => (only ? only.has(c.name || c.module) : !c.send || send));
    if (todo.some((c) => c.send) && !send) throw new Error('Those cases send real messages; add --send.');
    if (send && (!env.KUDOSITY_TEST_RECIPIENT || !env.KUDOSITY_TEST_SENDER)) throw new Error('--send needs KUDOSITY_TEST_RECIPIENT and KUDOSITY_TEST_SENDER.');

    const results = [];
    for (const testCase of todo) {
        process.stdout.write(`${(testCase.name || testCase.module).padEnd(22)} `);
        const r = await runCase(client, { teamId, learned, manifest, testCase, keep: process.argv.includes('--keep') });
        results.push(r);
        console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.status}${r.executionId ? `  execution ${r.executionId}` : ''}${r.error ? `  ${r.error}` : ''}${r.cleanup ? `  (cleanup: ${r.cleanup})` : ''}`);
    }
    const failed = results.filter((r) => !r.ok).length;
    console.log(`\n${results.length - failed}/${results.length} passed`);
    if (failed) process.exit(1);
}

if (require.main === module) {
    main().catch((e) => { console.error(e.message); process.exit(1); });
}

module.exports = { cases, learnFromBlueprint, buildBlueprint, buildFlow, runCase, loadEnvFile };
