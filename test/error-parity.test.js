'use strict';

/**
 * The Make IML function and the n8n TypeScript translator must say the same thing.
 *
 * They are separate implementations because the two platforms cannot share code — one
 * is an IML function evaluated by Make, the other compiles into an n8n node. Two
 * implementations of the same rules drift, and the drift is invisible: each looks
 * right in isolation while a customer gets different advice depending on which product
 * they use.
 *
 * Every input is a response body captured live from the API on 22 Oct 2026.
 *
 *   node --test test/error-parity.test.js
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'functions', 'kudosityError.js'), 'utf8');
const kudosityError = new Function(src + '; return kudosityError;')();

const CASES = [
    ['v1 auth',        { error: { code: 'AUTH_FAILED', description: 'The auth data you have provided is invalid.' } }, 401, 'v1', /BOTH the API key and its secret/],
    ['v1 plain text',  'Authorisation failed', 401, 'v1', /HTTP Basic/],
    ['v2 auth',        { status: 'Invalid api key' }, 401, 'v2', /x-api-key/],
    ['v2 no sender',   { error: 'sender: required' }, 400, 'v2', /will not fall back to an account default/],
    ['v2 bad sender',  { error: { detail: 'Request validation failed', issues: [{ name: 'sender', message: 'invalid sender number' }] } }, 400, 'v2', /not provisioned for WhatsApp or RCS/],
    ['v2 content_url', { error: 'Invalid content_url: https://x.test/a.png Content-Type: text/plain not supported' }, 400, 'v2', /fetches this URL itself/],
    ['v1 msisdn',      { error: { code: 'FIELD_EMPTY', description: 'Field msisdn is required' } }, 400, 'v1', /Recipient Number/],
    ['v1 message_id',  { error: { code: 'FIELD_INVALID', description: "You must provide 'message_id' or 'keyword_id', or both 'keyword' and 'number'" } }, 400, 'v1', /no all-recent-replies call/],
    ['404',            { error: { code: 'NOT_IMPLEMENTED', description: 'The method you are requesting is unsupported.' } }, 404, 'v1', /bug worth reporting/],
    ['429',            {}, 429, 'v2', /Rate limited/],
    ['500',            { error: 'boom' }, 503, 'v2', /retry on error/],
];

describe('every live error shape produces guidance', () => {
    for (const [label, body, status, api, expected] of CASES) {
        test(label, () => {
            const out = kudosityError(body, status, api);
            assert.match(out, new RegExp(`^\\[${status}\\]`), 'status must lead the message');
            assert.match(out, expected);
        });
    }
});

describe('the v1 and v2 remedies must not be swapped', () => {
    test('a v2 user is never told to find a secret', () => {
        const out = kudosityError({ status: 'Unauthorized' }, 401, 'v2');
        assert.doesNotMatch(out, /needs BOTH/,
            'v2 accounts have no secret — sending a user to look for one is the failure to avoid');
    });

    test('a v1 user is never pointed at x-api-key', () => {
        const out = kudosityError({ error: { code: 'AUTH_FAILED', description: 'nope' } }, 401, 'v1');
        assert.doesNotMatch(out, /x-api-key/);
    });
});

describe('degrades rather than breaks', () => {
    test('an unrecognised shape still produces a message', () => {
        assert.match(kudosityError({ weird: 'shape' }, 400, 'v2'), /^\[400\] The request to Kudosity failed/);
    });

    test('null and undefined do not throw', () => {
        assert.match(kudosityError(null, 500, 'v1'), /^\[500\]/);
        assert.match(kudosityError(undefined, 500, 'v2'), /^\[500\]/);
    });
});
