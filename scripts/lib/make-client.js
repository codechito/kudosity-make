'use strict';

/**
 * Minimal client for the Make API (https://<zone>.make.com/api/v2).
 *
 * Auth is "Authorization: Token <token>". The token is read from a file
 * (MAKE_TOKEN_FILE, default ~/make-api-token.txt) and never printed or logged.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

function readToken(file = process.env.MAKE_TOKEN_FILE || path.join(os.homedir(), 'make-api-token.txt')) {
    if (!fs.existsSync(file)) {
        throw new Error(`Make API token file not found: ${file}. Create it with the token on one line (chmod 600).`);
    }
    // Accept a bare token or a KEY=token line (e.g. MAKE_API_TOKEN=...).
    const line = fs.readFileSync(file, 'utf8').split(/\r?\n/).map((l) => l.trim()).find((l) => l && !l.startsWith('#')) || '';
    const token = line.replace(/^[A-Za-z_][A-Za-z0-9_.-]*\s*=\s*/, '').replace(/^(['"])(.*)\1$/, '$2');
    if (!token) throw new Error(`Make API token file is empty: ${file}`);
    return token;
}

function baseUrl(zone = process.env.MAKE_ZONE) {
    if (!zone) throw new Error('Set MAKE_ZONE to your Make region, e.g. us1 or eu1 (see the address bar when signed in).');
    return /^https?:\/\//.test(zone) ? zone.replace(/\/$/, '') : `https://${zone}.make.com/api/v2`;
}

/**
 * request(method, path, { json, text, contentType, query })
 *  - json: object body (application/json)
 *  - text: raw string body with contentType (e.g. application/jsonc, application/javascript)
 * Returns parsed JSON (or text). Throws an Error with status and Make's message on failure.
 */
function createClient({ token, zone, fetchImpl = globalThis.fetch } = {}) {
    const base = baseUrl(zone);
    const auth = `Token ${token || readToken()}`;

    async function request(method, p, { json, text, contentType, query } = {}) {
        const url = new URL(base + p);
        for (const [k, v] of Object.entries(query || {})) url.searchParams.set(k, v);
        const headers = { Authorization: auth, Accept: 'application/json' };
        let body;
        if (json !== undefined) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(json); }
        else if (text !== undefined) { headers['Content-Type'] = contentType || 'text/plain'; body = text; }
        const res = await fetchImpl(url, { method, headers, body });
        const raw = await res.text();
        let data = raw;
        try { data = raw ? JSON.parse(raw) : null; } catch (_) { /* keep text */ }
        if (!res.ok) {
            const msg = (data && (data.message || data.detail || (data.error && data.error.message))) || String(raw).slice(0, 300);
            const err = new Error(`${method} ${p} -> ${res.status}: ${msg}`);
            err.status = res.status;
            err.body = data;
            throw err;
        }
        return data;
    }
    return { request, base };
}

module.exports = { createClient, readToken, baseUrl };
