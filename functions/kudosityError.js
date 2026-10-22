/**
 * Turns a Kudosity API failure into something a user can act on.
 *
 * Mirrors kudosity-n8n/nodes/shared/errors.ts — same six shapes, same remedies. Kept
 * as an IML function rather than an expression in base.imljson because the branching
 * is past what ifempty() can carry, and because the two integrations should not drift
 * apart on what they tell people.
 *
 * Shapes observed live on 22 Oct 2026:
 *   v1 auth       {"error":{"code":"AUTH_FAILED","description":"..."}}
 *   v1 field      {"error":{"code":"FIELD_EMPTY","description":"Field msisdn is required"}}
 *   v1 non-Basic  Authorisation failed                     <- plain text, not JSON
 *   v2 auth       {"status":"Unauthorized"} / {"status":"Invalid api key"}
 *   v2 simple     {"error":"sender: required"}             <- error is a string
 *   v2 rich       {"error":{"detail":"...","issues":[{"name":"sender","message":"..."}]}}
 *
 * @param {*} body        the parsed response body, or a string when it is not JSON
 * @param {number} status the HTTP status code
 * @param {string} api    'v1' or 'v2' — the remedies differ, and telling a v2 user to
 *                        check their secret sends them after one they do not have
 */
function kudosityError(body, status, api) {
    var code = '';
    var text = '';
    var fields = [];

    if (body === null || body === undefined) {
        text = '';
    } else if (typeof body === 'string') {
        text = body.trim();
    } else if (typeof body.error === 'string') {
        text = body.error;
    } else if (body.error && typeof body.error === 'object') {
        var e = body.error;
        code = e.code || '';
        if (e.issues && e.issues.length) {
            var parts = [];
            for (var i = 0; i < e.issues.length; i++) {
                parts.push(e.issues[i].name + ': ' + e.issues[i].message);
                fields.push(e.issues[i].name);
            }
            text = parts.join('; ');
        } else {
            text = e.description || e.detail || e.message || e.title || '';
        }
    } else if (body.status) {
        text = body.status;
    } else if (body.message) {
        text = body.message;
    }

    if (!text) text = 'The request to Kudosity failed';

    var t = text.toLowerCase();
    var advice = '';

    if (code === 'AUTH_FAILED' || status === 401 ||
        t.indexOf('unauthorized') >= 0 || t.indexOf('invalid api key') >= 0 ||
        t.indexOf('authorisation failed') >= 0) {
        advice = api === 'v1'
            ? 'The V1 connection needs BOTH the API key and its secret — it authenticates with HTTP Basic over key:secret. Both are under Settings > API in your Kudosity account. A key on its own will not work here.'
            : 'The V2 connection needs only the API key, sent as the x-api-key header. It is under Settings > API in your Kudosity account. The V1 secret is not used by V2.';
    } else if (fields.indexOf('sender') >= 0 || t.indexOf('invalid sender') >= 0) {
        advice = 'The sender is not valid for this channel. Run the Get Sender IDs module to see what this account may send as. A virtual number that works for SMS is often not provisioned for WhatsApp or RCS — that needs enabling on the account.';
    } else if (t.indexOf('sender: required') >= 0) {
        advice = 'The V2 API requires a sender and will not fall back to an account default — unlike V1, where leaving From blank is allowed. Set Sender to one of the values returned by Get Sender IDs.';
    } else if (t.indexOf('content_url') >= 0) {
        advice = 'Kudosity fetches this URL itself, so it must be publicly reachable and serve an image content type. A URL that opens fine in a browser can still fail: some hosts block Kudosity\'s fetcher, and a redirect to an HTML page is rejected as the wrong content type.';
    } else if (code === 'FIELD_EMPTY' && t.indexOf('msisdn') >= 0) {
        advice = 'Get Delivery Status needs the Recipient Number as well as the Message ID.';
    } else if (code === 'FIELD_INVALID' && t.indexOf('message_id') >= 0) {
        advice = 'Get Replies needs a Message ID — the API has no all-recent-replies call. Use the ID returned when the message was sent.';
    } else if (code === 'NOT_IMPLEMENTED' || status === 404) {
        advice = 'That endpoint does not exist on this API. If it came from a Kudosity module rather than a custom call, it is a bug worth reporting.';
    } else if (status === 429) {
        advice = 'Rate limited. Lower the scenario\'s throughput, or add a Sleep module before this one.';
    } else if (status >= 500) {
        advice = 'Kudosity returned a server error, so the request itself is probably fine. Set this module to retry on error rather than changing anything.';
    }

    return '[' + status + '] ' + text + (advice ? ' — ' + advice : '');
}
