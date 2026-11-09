'use strict';

/**
 * Offline tests for the Make deploy and smoke-test scripts (SAL-116, SAL-99/100).
 * The Make API is replaced by a fake client that records calls.
 *
 *   node --test test/make-tooling.test.js
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { buildPlan, apply, prune, withoutFunctions, loadManifest } = require('../scripts/deploy');
const { learnFromBlueprint, buildBlueprint, runCase, cases, loadEnvFile } = require('../scripts/smoke-test');
const { createClient, baseUrl, readToken } = require('../scripts/lib/make-client');

const manifest = loadManifest();
const APP = manifest.app.name;

function fakeClient(handler = () => ({})) {
    const calls = [];
    return {
        calls,
        async request(method, p, opts = {}) {
            calls.push({ method, path: p, ...opts });
            const out = handler(method, p, opts);
            if (out instanceof Error) throw out;
            return out;
        },
    };
}

describe('manifest', () => {
    test('every module, connection and webhook file exists and is declared', () => {
        assert.doesNotThrow(() => buildPlan(manifest));
    });
    test('a missing module folder is reported', () => {
        const broken = JSON.parse(JSON.stringify(manifest));
        broken.modules.push({ name: 'noSuchModule', label: 'x', description: 'x', type: 'action', connection: 'v2' });
        assert.throws(() => buildPlan(broken), /modules\/noSuchModule\/api\.imljson/);
    });
    test('an undeclared module folder is reported', () => {
        const broken = JSON.parse(JSON.stringify(manifest));
        broken.modules = broken.modules.filter((m) => m.name !== 'v1GetAccount');
        assert.throws(() => buildPlan(broken), /modules\/v1GetAccount is not in make-app\.json/);
    });
    test('instant triggers are linked to a declared webhook', () => {
        for (const m of manifest.modules.filter((x) => x.type === 'instant')) {
            assert.ok(manifest.webhooks.some((w) => w.key === m.webhook), m.name);
        }
    });
});

describe('deploy', () => {
    test('fresh deploy creates everything with the right types and links', async () => {
        const stateFile = path.join(__dirname, '..', '.make', `state-${APP}.json`);
        const backup = fs.existsSync(stateFile) ? fs.readFileSync(stateFile) : null;
        if (backup) fs.unlinkSync(stateFile);
        try {
            const client = fakeClient((method, p, { json }) => {
                if (method === 'GET' && p === '/sdk/apps') return { apps: [{ name: 'someone-else', version: 1 }] };
                if (method === 'POST' && p === '/sdk/apps') return { app: { name: APP } };
                if (method === 'GET') return [];
                if (method === 'POST' && p === `/sdk/apps/${APP}/connections`) return { appConnection: { name: `conn-${json.label.slice(-2)}` } };
                if (method === 'POST' && p === `/sdk/apps/${APP}/webhooks`) return { appWebhook: { name: `hook-${json.connection}` } };
                return {};
            });
            await apply(client, manifest, buildPlan(manifest), () => {});

            assert.ok(client.calls.some((c) => c.method === 'POST' && c.path === '/sdk/apps'));
            const modPosts = client.calls.filter((c) => c.method === 'POST' && c.path === `/sdk/apps/${APP}/1/modules`);
            assert.strictEqual(modPosts.length, manifest.modules.length);
            const watch = modPosts.find((c) => c.json.name === 'watchEvents').json;
            assert.deepStrictEqual([watch.typeId, watch.connection, watch.webhook], [10, 'conn-V2', 'hook-conn-V2']);
            const send = modPosts.find((c) => c.json.name === 'v1SendSms').json;
            assert.deepStrictEqual([send.typeId, send.connection, send.webhook], [4, 'conn-V1', undefined]);

            const puts = client.calls.filter((c) => c.method === 'PUT');
            assert.ok(puts.some((c) => c.path === `/sdk/apps/${APP}/1/functions/kudosityError/code` && c.contentType === 'application/javascript'));
            assert.ok(puts.some((c) => c.path === '/sdk/apps/connections/conn-V1/api' && c.contentType === 'application/jsonc'));
            assert.ok(puts.some((c) => c.path === '/sdk/apps/webhooks/hook-conn-V1/attach'));
            // Module fields go to "expect" (mappable); static "parameters" is reset to [].
            const expect = puts.find((c) => c.path === `/sdk/apps/${APP}/1/modules/v2SendSms/expect`);
            assert.ok(expect && JSON.parse(expect.text).some((p) => p.name === 'recipient'), 'fields uploaded as mappable');
            assert.strictEqual(puts.find((c) => c.path === `/sdk/apps/${APP}/1/modules/v2SendSms/parameters`).text, '[]');
            assert.ok(puts.some((c) => c.path === `/sdk/apps/${APP}/1/modules/v2SendSms/interface`));
            const watchPuts = puts.filter((c) => c.path.includes('/modules/watchEvents/')).map((c) => c.path.split('/').pop()).sort();
            assert.deepStrictEqual(watchPuts, ['interface', 'samples'], 'instant triggers carry only interface and samples');
            const universal = modPosts.find((c) => c.json.name === 'v2MakeApiCall').json;
            assert.strictEqual(universal.typeId, 12);
        } finally {
            if (backup) fs.writeFileSync(stateFile, backup); else fs.rmSync(stateFile, { force: true });
        }
    });

    test('re-deploy updates instead of creating', async () => {
        const stateFile = path.join(__dirname, '..', '.make', `state-${APP}.json`);
        const backup = fs.existsSync(stateFile) ? fs.readFileSync(stateFile) : null;
        fs.mkdirSync(path.dirname(stateFile), { recursive: true });
        fs.writeFileSync(stateFile, JSON.stringify({ connections: { v1: 'c1', v2: 'c2' }, webhooks: { v1Inbound: 'h1', v2Events: 'h2' } }));
        try {
            const client = fakeClient((method, p) => {
                if (method === 'GET' && p === '/sdk/apps') return { apps: [{ name: APP, version: 1 }] };
                if (method === 'GET' && p.endsWith('/functions')) return [{ name: 'kudosityError' }];
                if (method === 'GET' && p.endsWith('/modules')) return manifest.modules.map((m) => ({ name: m.name }));
                return {};
            });
            await apply(client, manifest, buildPlan(manifest), () => {});
            const posts = client.calls.filter((c) => c.method === 'POST');
            assert.deepStrictEqual(posts, [], 'nothing created');
            assert.strictEqual(client.calls.filter((c) => c.method === 'PATCH' && c.path.includes('/modules/')).length, manifest.modules.length);
        } finally {
            if (backup) fs.writeFileSync(stateFile, backup); else fs.rmSync(stateFile, { force: true });
        }
    });
});

describe('module type changes', () => {
    test('a module whose type changed is deleted and recreated', async () => {
        const client = fakeClient((method, p) => {
            if (method === 'GET' && p === '/sdk/apps') return { apps: [{ name: APP, version: 1 }] };
            if (method === 'GET' && p.endsWith('/modules')) return manifest.modules.map((m) => ({ name: m.name, typeId: m.name === 'v1GetNumbers' ? 4 : { action: 4, search: 9, instant: 10, universal: 12 }[m.type] }));
            if (method === 'GET') return [];
            return { appConnection: { name: 'c' }, appWebhook: { name: 'h' } };
        });
        const plan = buildPlan(manifest).filter((s) => s.kind !== 'connection' && s.kind !== 'webhook');
        await apply(client, manifest, plan, () => {});
        const touched = client.calls.filter((c) => c.method !== 'GET' && c.method !== 'PUT' && c.path.includes('/modules'));
        assert.deepStrictEqual(touched.filter((c) => c.method !== 'PATCH').map((c) => `${c.method} ${c.path.split('/modules')[1] || ''} ${c.json ? c.json.typeId : ''}`.trim()),
            ['DELETE /v1GetNumbers', 'POST  9']);
    });
});

describe('--no-functions', () => {
    test('replaces every kudosityError call and leaves the rest', () => {
        const src = '{"error": {"message": "{{kudosityError(body, statusCode, \'v1\')}}"}, "url": "/x"}';
        const out = withoutFunctions(src);
        assert.ok(!out.includes('kudosityError'));
        assert.match(out, /\[\{\{statusCode\}\}\] \{\{ifempty\(body\.error\.description/);
        assert.match(out, /"url": "\/x"/);
    });
    test('no uploaded file still calls the function', () => {
        for (const step of buildPlan(manifest)) {
            for (const f of [step.file, ...(step.sections || []).map((x) => x.file)].filter((x) => x && x.endsWith('.imljson'))) {
                assert.ok(!withoutFunctions(fs.readFileSync(path.join(__dirname, '..', f), 'utf8')).includes('kudosityError'), f);
            }
        }
    });
});

describe('prune', () => {
    test('deletes only what the repo does not declare, modules first', async () => {
        const stateFile = path.join(__dirname, '..', '.make', `state-${APP}.json`);
        const backup = fs.existsSync(stateFile) ? fs.readFileSync(stateFile) : null;
        fs.mkdirSync(path.dirname(stateFile), { recursive: true });
        fs.writeFileSync(stateFile, JSON.stringify({ connections: { v1: 'c1', v2: 'c2' }, webhooks: { v1Inbound: 'h1', v2Events: 'h2' } }));
        try {
            const client = fakeClient((method, p) => {
                if (method !== 'GET') return {};
                if (p.endsWith('/modules')) return [...manifest.modules.map((m) => ({ name: m.name })), { name: 'oldTestModule' }];
                if (p.endsWith('/functions')) return [{ name: 'kudosityError' }, { name: 'oldHelper' }];
                if (p.endsWith('/connections')) return [{ name: 'c1', label: 'Kudosity V1' }, { name: 'c2', label: 'Kudosity V2' }, { name: 'c3', label: 'Kudosity V2' }, { name: 'c4', label: 'Old Basic' }];
                if (p.endsWith('/webhooks')) return [{ name: 'h1', label: 'Kudosity V1 Inbound SMS' }, { name: 'h2', label: 'Kudosity V2 Events' }, { name: 'h9', label: 'Test hook' }];
                return [];
            });
            await prune(client, manifest, () => {});
            const deletes = client.calls.filter((c) => c.method === 'DELETE').map((c) => c.path);
            assert.deepStrictEqual(deletes, [
                `/sdk/apps/${APP}/1/modules/oldTestModule`,
                '/sdk/apps/webhooks/h9',
                '/sdk/apps/connections/c3',
                '/sdk/apps/connections/c4',
                `/sdk/apps/${APP}/1/functions/oldHelper`,
            ]);
        } finally {
            if (backup) fs.writeFileSync(stateFile, backup); else fs.rmSync(stateFile, { force: true });
        }
    });
});

describe('smoke test', () => {
    const blueprint = {
        flow: [
            { id: 1, module: 'app#kudosity-x1:v1GetAccount', version: 1, parameters: { __IMTCONN__: 111 }, mapper: {} },
            { id: 2, module: 'builtin:BasicRouter', routes: [{ flow: [
                { id: 3, module: 'app#kudosity-x1:v2SendSms', version: 1, parameters: { __IMTCONN__: 222 }, mapper: {} } ] }] },
        ],
    };

    test('learns module prefix and both connections from a blueprint', () => {
        const l = learnFromBlueprint(JSON.stringify(blueprint), manifest);
        assert.deepStrictEqual(l, { modulePrefix: 'app#kudosity-x1', moduleVersion: 1, connectionParam: '__IMTCONN__', connections: { v1: 111, v2: 222 } });
    });

    test('refuses a scenario with no Kudosity modules', () => {
        assert.throws(() => learnFromBlueprint({ flow: [{ id: 1, module: 'http:ActionSendData' }] }, manifest), /No Kudosity modules/);
    });

    test('builds a one-module blueprint on the right connection', () => {
        const l = learnFromBlueprint(blueprint, manifest);
        const bp = buildBlueprint(l, 'v1FormatNumber', 'v1', { msisdn: '0412345678' });
        assert.strictEqual(bp.flow.length, 1);
        assert.strictEqual(bp.flow[0].module, 'app#kudosity-x1:v1FormatNumber');
        assert.deepStrictEqual(bp.flow[0].parameters, { __IMTCONN__: 111 });
        assert.throws(() => buildBlueprint({ ...l, connections: {} }, 'v2SendSms', 'v2', {}), /No v2 connection/);
    });

    test('runCase creates, starts, runs and always deletes', async () => {
        const learned = learnFromBlueprint(blueprint, manifest);
        const client = fakeClient((method, p) => {
            if (method === 'POST' && p === '/scenarios') return { scenario: { id: 9 } };
            if (p === '/scenarios/9/run') return { executionId: 'e1', status: 1 };
            return {};
        });
        const r = await runCase(client, { teamId: '5', learned, manifest, testCase: { module: 'v1GetAccount', mapper: {} } });
        assert.deepStrictEqual([r.ok, r.status, r.executionId], [true, 'success', 'e1']);
        const create = client.calls[0];
        assert.strictEqual(create.json.teamId, 5);
        assert.strictEqual(JSON.parse(create.json.blueprint).flow[0].module, 'app#kudosity-x1:v1GetAccount');
        assert.ok(client.calls.some((c) => c.method === 'DELETE' && c.path === '/scenarios/9'));
    });

    test('a multi-step case maps earlier outputs and uses each step\'s connection', async () => {
        const learned = learnFromBlueprint(blueprint, manifest);
        const client = fakeClient((method, p) => (method === 'POST' && p === '/scenarios' ? { scenario: { id: 9 } } : p === '/scenarios/9/run' ? { status: 1 } : {}));
        const flow = cases({ KUDOSITY_TEST_RECIPIENT: '61400000000', KUDOSITY_TEST_SENDER: '61400000001' }).find((c) => c.name === 'v1SmsLifecycle');
        const r = await runCase(client, { teamId: '5', learned, manifest, testCase: flow });
        assert.strictEqual(r.ok, true);
        const bp = JSON.parse(client.calls[0].json.blueprint);
        assert.deepStrictEqual(bp.flow.map((n) => n.module.split(':')[1]), ['v1SendSms', 'v1GetDeliveryStatus', 'v1GetReplies']);
        assert.strictEqual(bp.flow[1].mapper.message_id, '{{1.message_id}}');
        assert.ok(bp.flow.every((n) => n.parameters.__IMTCONN__ === 111), 'all V1 steps use the V1 connection');
    });

    test('runCase reports a failed run and still deletes', async () => {
        const learned = learnFromBlueprint(blueprint, manifest);
        const client = fakeClient((method, p) => {
            if (method === 'POST' && p === '/scenarios') return { scenario: { id: 9 } };
            if (p === '/scenarios/9/run') return new Error('POST /scenarios/9/run -> 400: boom');
            return {};
        });
        const r = await runCase(client, { teamId: '5', learned, manifest, testCase: { module: 'v1GetAccount', mapper: {} } });
        assert.strictEqual(r.ok, false);
        assert.match(r.error, /boom/);
        assert.ok(client.calls.some((c) => c.method === 'DELETE'));
    });

    test('sending cases are marked so they only run with --send', () => {
        const sends = cases({}).filter((c) => c.send).map((c) => c.name || c.module);
        assert.deepStrictEqual(sends.sort(), ['v1ScheduleThenCancel', 'v1SmsLifecycle', 'v2SendMms', 'v2SendRcs', 'v2SendSms', 'v2SendWhatsApp']);
        for (const c of cases({}).filter((x) => !x.send)) assert.ok(!c.steps, `${c.module} is read-only and single-step`);
    });

    test('env file parsing', () => {
        const f = path.join(os.tmpdir(), `kmt-${process.pid}.env`);
        fs.writeFileSync(f, '# c\nKUDOSITY_TEST_SENDER="Kudosity"\n\nKUDOSITY_TEST_RECIPIENT = +61400000000\n');
        try {
            assert.deepStrictEqual(loadEnvFile(f), { KUDOSITY_TEST_SENDER: 'Kudosity', KUDOSITY_TEST_RECIPIENT: '+61400000000' });
        } finally { fs.unlinkSync(f); }
    });
});

describe('make client', () => {
    test('token file may be bare or NAME=token', () => {
        const f = path.join(os.tmpdir(), `kmt-tok-${process.pid}`);
        try {
            fs.writeFileSync(f, 'abc-123\n');
            assert.strictEqual(readToken(f), 'abc-123');
            fs.writeFileSync(f, '# make\nMAKE_API_TOKEN="abc-123"\n');
            assert.strictEqual(readToken(f), 'abc-123');
        } finally { fs.unlinkSync(f); }
    });
    test('zone to base URL', () => {
        assert.strictEqual(baseUrl('eu1'), 'https://eu1.make.com/api/v2');
        assert.throws(() => baseUrl(''), /MAKE_ZONE/);
    });
    test('sends Token auth and surfaces Make errors with status', async () => {
        let seen;
        const fetchImpl = async (url, init) => {
            seen = { url: String(url), init };
            return { ok: false, status: 403, text: async () => JSON.stringify({ message: 'Permission denied' }) };
        };
        const c = createClient({ token: 't0k', zone: 'us1', fetchImpl });
        await assert.rejects(c.request('GET', '/scenarios', { query: { teamId: 1 } }), (e) => e.status === 403 && /Permission denied/.test(e.message));
        assert.strictEqual(seen.url, 'https://us1.make.com/api/v2/scenarios?teamId=1');
        assert.strictEqual(seen.init.headers.Authorization, 'Token t0k');
    });
});
