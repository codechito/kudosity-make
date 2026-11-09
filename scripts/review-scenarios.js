#!/usr/bin/env node
'use strict';

/**
 * Builds the scenarios Make's review team asks for: one per module, each run once so
 * the reviewer sees a successful execution. Unlike the smoke test, they are kept.
 *
 *   MAKE_ZONE=eu1 MAKE_TEAM_ID=36539 node scripts/review-scenarios.js            # create or update, then run each
 *   ... --only "V1 Send SMS"                                                      # one scenario by name suffix
 *   ... --no-run                                                                  # create or update only
 *
 * Re-running replaces each scenario's blueprint in place (matched by name, IDs kept in
 * .make/review-scenarios.json), so links already given to Make stay valid.
 * Sends real messages between KUDOSITY_TEST_SENDER and KUDOSITY_TEST_RECIPIENT (both
 * company virtual numbers). Make's rules: no personal data in review scenarios.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { buildFlow, loadEnvFile } = require('./smoke-test');

const ROOT = path.join(__dirname, '..');
const IDS_FILE = path.join(ROOT, '.make', 'review-scenarios.json');
const PREFIX = 'Kudosity Review - ';
const MMS_IMAGE = 'https://www.gstatic.com/webp/gallery/1.jpg';

function scenarios(env) {
    const to = env.KUDOSITY_TEST_RECIPIENT;
    const from = env.KUDOSITY_TEST_SENDER;
    const tomorrow = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    return [
        { name: 'Send an SMS', steps: [{ module: 'v2SendSms', mapper: { sender: from, recipient: to, message: 'Your order #1001 has shipped. Reply STOP to opt out.', message_ref: 'review-sms', track_links: false } }] },
        { name: 'Send an MMS', steps: [{ module: 'v2SendMms', mapper: { sender: from, recipient: to, subject: 'Order #1001', message: 'Here is a photo of your order.', content_urls: [MMS_IMAGE], message_ref: 'review-mms' } }] },
        { name: 'Send a WhatsApp Message', steps: [{ module: 'v2SendWhatsApp', mapper: { sender: from, recipient: to, content_type: 'text', message: 'Your order #1001 has shipped.', message_ref: 'review-whatsapp' } }], needs: 'a WhatsApp-enabled sender' },
        { name: 'Send an RCS Message', steps: [{ module: 'v2SendRcs', mapper: { sender: from, recipient: to, content_type: 'text', message: 'Your order #1001 has shipped.', message_ref: 'review-rcs' } }], needs: 'an RCS agent sender' },
        { name: 'Make an API Call', steps: [{ module: 'v2MakeApiCall', mapper: { url: '/sms', method: 'GET', qs: [{ key: 'limit', value: '1' }] } }] },
        { name: 'V1 Send SMS, Get Delivery Status, List Replies', steps: [
            { module: 'v1SendSms', mapper: { to, from, message: 'Your appointment is tomorrow at 10am. Reply YES to confirm.' } },
            { module: 'v1GetDeliveryStatus', mapper: { message_id: '{{1.message_id}}', msisdn: to } },
            { module: 'v1GetReplies', mapper: { message_id: '{{1.message_id}}', limit: 10 } }] },
        { name: 'V1 Schedule and Cancel an SMS', steps: [
            { module: 'v1SendSms', mapper: { to, from, message: 'Reminder: your appointment is tomorrow.', send_at: tomorrow } },
            { module: 'v1CancelSms', mapper: { id: '{{1.message_id}}' } }] },
        { name: 'V1 Get Account Balance', steps: [{ module: 'v1GetAccount', mapper: {} }] },
        { name: 'V1 Get Sender IDs', steps: [{ module: 'v1GetSenderIds', mapper: {} }] },
        { name: 'V1 List Virtual Numbers', steps: [{ module: 'v1GetNumbers', mapper: { filter: 'owned', limit: 10 } }] },
        { name: 'V1 Format a Number', steps: [{ module: 'v1FormatNumber', mapper: { msisdn: '0412345678', countrycode: 'AU' } }] },
        { name: 'V1 Make an API Call', steps: [{ module: 'v1MakeApiCall', mapper: { url: '/get-balance.json', method: 'GET' } }] },
        // Triggers listen rather than run. hookKey names a webhook in .make/test-connections.json; without one the
        // scenario is created with no webhook, and the tester adds it in Make (for V1 that rewrites a number's
        // forward URL, which is why it is never done automatically).
        { name: 'Watch Events', trigger: 'watchEvents', hookKey: 'v2Hook' },
        { name: 'V1 Watch Inbound SMS', trigger: 'watchInboundSms', hookKey: 'v1Hook', needs: 'a webhook on a virtual number (add it in the trigger)' },
    ];
}

/** Pure: a scenario holding one instant trigger, optionally bound to a Make webhook. */
function triggerBlueprint(learned, moduleName, hookId) {
    return {
        name: moduleName,
        flow: [{ id: 1, module: `${learned.modulePrefix}:${moduleName}`, version: learned.moduleVersion || 1,
            parameters: hookId ? { __IMTHOOK__: hookId } : {}, mapper: {}, metadata: { designer: { x: 0, y: 0 } } }],
        metadata: { instant: true, version: 1, designer: { orphans: [] },
            scenario: { roundtrips: 1, maxErrors: 3, autoCommit: true, autoCommitTriggerLast: true, sequential: false, confidential: false, dataloss: false, dlq: false } },
    };
}

function scenarioUrl(zone, teamId, id) {
    return `https://${zone}.make.com/${teamId}/scenarios/${id}/edit`;
}

async function main() {
    const { createClient } = require('./lib/make-client');
    const client = createClient();
    const zone = process.env.MAKE_ZONE;
    const teamId = Number(process.env.MAKE_TEAM_ID);
    if (!teamId) throw new Error('Set MAKE_TEAM_ID.');
    const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'make-app.json'), 'utf8'));
    const learned = JSON.parse(fs.readFileSync(path.join(ROOT, '.make', 'learned.json'), 'utf8'));
    const env = { ...loadEnvFile(process.env.KUDOSITY_TEST_ENV || path.join(os.homedir(), 'kudosity-make-test.env')), ...process.env };
    if (!env.KUDOSITY_TEST_RECIPIENT || !env.KUDOSITY_TEST_SENDER) throw new Error('Needs KUDOSITY_TEST_RECIPIENT and KUDOSITY_TEST_SENDER.');
    const ids = fs.existsSync(IDS_FILE) ? JSON.parse(fs.readFileSync(IDS_FILE, 'utf8')) : {};
    const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null;
    const run = !process.argv.includes('--no-run');
    const connOf = Object.fromEntries(manifest.modules.map((m) => [m.name, m.connection]));
    const hooksFile = path.join(ROOT, '.make', 'test-connections.json');
    const hooks = fs.existsSync(hooksFile) ? JSON.parse(fs.readFileSync(hooksFile, 'utf8')) : {};
    // The Watch Events scenario was first made by hand during testing; adopt it rather than duplicate it.
    if (!ids['Watch Events'] && hooks.watchScenario) ids['Watch Events'] = hooks.watchScenario;

    const rows = [];
    for (const s of scenarios(env).filter((x) => !only || x.name === only)) {
        const name = PREFIX + s.name;
        const blueprint = s.trigger ? triggerBlueprint(learned, s.trigger, hooks[s.hookKey]) :
            buildFlow(learned, s.steps.map((st) => ({ ...st, connection: connOf[st.module] })), name);
        blueprint.name = name;
        let id = ids[s.name];
        if (id) {
            try { await client.request('PATCH', `/scenarios/${id}`, { query: { confirmed: 'true' }, json: { blueprint: JSON.stringify(blueprint) } }); }
            catch (e) { if (e.status !== 404) throw e; id = null; }
        }
        if (!id) {
            const created = await client.request('POST', '/scenarios', { query: { confirmed: 'true' }, json: {
                teamId, blueprint: JSON.stringify(blueprint), scheduling: JSON.stringify({ type: s.trigger ? 'immediately' : 'on-demand' }) } });
            id = (created.scenario || created).id;
            ids[s.name] = id;
            fs.mkdirSync(path.dirname(IDS_FILE), { recursive: true });
            fs.writeFileSync(IDS_FILE, JSON.stringify(ids, null, 2));
        }
        const row = { name: s.name, modules: s.trigger || s.steps.map((x) => x.module).join(' > '), url: scenarioUrl(zone, teamId, id), result: 'not run' };
        if (s.trigger) {
            // A trigger with a webhook is switched on to listen; without one it stays off until the tester adds it.
            if (hooks[s.hookKey]) {
                try { await client.request('POST', `/scenarios/${id}/start`); row.result = 'success: listening'; } catch (e) { row.result = /already running/i.test(e.message) ? 'success: listening' : `error: ${e.message}`; }
            } else row.result = 'created without a webhook';
        } else if (run) {
            try {
                await client.request('POST', `/scenarios/${id}/start`);
                const r = await client.request('POST', `/scenarios/${id}/run`, { json: { responsive: true } });
                row.result = { 1: 'success', 2: 'warning', 3: 'error' }[r.status] || String(r.status);
                if (r.status !== 1) {
                    const logs = await client.request('GET', `/scenarios/${id}/logs`);
                    const end = (logs.scenarioLogs || []).find((l) => l.id === r.executionId) || (logs.scenarioLogs || [])[0];
                    if (end && end.error) row.result += `: ${end.error.message}`;
                }
            } catch (e) {
                row.result = `error: ${e.message}`;
            } finally {
                // On-demand scenarios don't need to stay active; stopping keeps them from looking live.
                try { await client.request('POST', `/scenarios/${id}/stop`); } catch (_) { /* already stopped */ }
            }
        }
        if (s.needs && row.result !== 'success') row.result += ` (needs ${s.needs})`;
        rows.push(row);
        console.log(`${row.result.startsWith('success') ? 'OK  ' : 'FAIL'} ${s.name}\n     ${row.url}\n     ${row.result}`);
    }
    return rows;
}

if (require.main === module) {
    main().catch((e) => { console.error(e.message); process.exit(1); });
}

module.exports = { scenarios, scenarioUrl, triggerBlueprint };
