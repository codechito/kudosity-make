'use strict';

/**
 * Usage tracking headers (SAL-94).
 *
 * Every request this app makes to a Kudosity API must identify the integration,
 * its release, and what the request is for. A request file that forgets them is
 * invisible in usage reports.
 *
 * Make has no shared code between request files, so each one carries the headers
 * literally. This test finds every request file on disk — connections, modules,
 * webhook attach/detach — so a new file without headers fails here.
 *
 * The action vocabulary is shared with the n8n node, so reports can compare them.
 *
 *   node --test test/headers.test.js
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const pkg = require(path.join(ROOT, 'package.json'));
const read = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

const EXPECTED = {
    'connections/kudosity-v1/api.imljson': 'connect',
    'connections/kudosity-v2/api.imljson': 'connect',
    'modules/v1CancelSms/api.imljson': 'sms.cancel',
    'modules/v1FormatNumber/api.imljson': 'number.format',
    'modules/v1GetAccount/api.imljson': 'account.get',
    'modules/v1GetDeliveryStatus/api.imljson': 'status.get',
    'modules/v1GetNumbers/api.imljson': 'numbers.get',
    'modules/v1GetReplies/api.imljson': 'replies.get',
    'modules/v1GetSenderIds/api.imljson': 'senderids.get',
    'modules/v1SendSms/api.imljson': 'sms.send',
    'modules/v2SendMms/api.imljson': 'mms.send',
    'modules/v2SendRcs/api.imljson': 'rcs.send',
    'modules/v2SendSms/api.imljson': 'sms.send',
    'modules/v2SendWhatsApp/api.imljson': 'whatsapp.send',
    'webhooks/v1Inbound/attach.imljson': 'trigger.subscribe',
    'webhooks/v1Inbound/detach.imljson': 'trigger.unsubscribe',
    'webhooks/v2Events/attach.imljson': 'trigger.subscribe',
    'webhooks/v2Events/detach.imljson': 'trigger.unsubscribe',
};

/** Every file on disk that makes an outbound request. */
function requestFiles() {
    const found = [];
    for (const dir of ['connections', 'modules']) {
        for (const name of fs.readdirSync(path.join(ROOT, dir))) {
            found.push(`${dir}/${name}/api.imljson`);
        }
    }
    for (const name of fs.readdirSync(path.join(ROOT, 'webhooks'))) {
        // webhooks/*/api.imljson handles the INCOMING payload; only attach and
        // detach call Kudosity.
        for (const f of ['attach.imljson', 'detach.imljson']) {
            if (fs.existsSync(path.join(ROOT, 'webhooks', name, f))) found.push(`webhooks/${name}/${f}`);
        }
    }
    return found.sort();
}

function assertConstant(headers, where) {
    assert.ok(headers, `${where} has no headers`);
    assert.strictEqual(headers['User-Agent'], `kudosity-make/${pkg.version}`, where);
    assert.strictEqual(headers['X-Kudosity-Source'], 'kudosity-make', where);
    assert.strictEqual(headers['X-Kudosity-Source-Version'], pkg.version, where);
}

describe('usage tracking headers', () => {
    test('every request file on disk has an expected action', () => {
        assert.deepStrictEqual(requestFiles(), Object.keys(EXPECTED).sort());
    });

    for (const [file, action] of Object.entries(EXPECTED)) {
        test(`${file} sends ${action}`, () => {
            const headers = read(file).headers;
            assertConstant(headers, file);
            assert.strictEqual(headers['X-Kudosity-Action'], action, file);
        });
    }

    test('base carries the constant headers as a fallback', () => {
        assertConstant(read('base.imljson').headers, 'base.imljson');
    });

    test('V2 request files authenticate themselves rather than relying on base', () => {
        // Whether Make merges or replaces base headers when a module sets its own is
        // not verified, so files that set headers must also set their own auth.
        for (const file of Object.keys(EXPECTED)) {
            const h = read(file).headers;
            const v1 = file.includes('v1') || file.includes('kudosity-v1');
            if (v1) assert.match(h.Authorization, /^Basic /, file);
            else assert.ok(h['x-api-key'], `${file} has no x-api-key`);
        }
    });

    test('no tracking header references message content or contact data', () => {
        for (const file of [...Object.keys(EXPECTED), 'base.imljson']) {
            const h = read(file).headers;
            for (const key of ['User-Agent', 'X-Kudosity-Source', 'X-Kudosity-Source-Version', 'X-Kudosity-Action']) {
                if (h[key] === undefined) continue;
                assert.ok(!h[key].includes('{{'), `${file} ${key} is dynamic: ${h[key]}`);
            }
        }
    });
});
