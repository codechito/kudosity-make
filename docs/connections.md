# Connections

The app has two connections, because Kudosity has two APIs and they do not share an
authentication scheme.

| | Kudosity V1 | Kudosity V2 |
|---|---|---|
| Host | `api.transmitsms.com` | `api.transmitmessage.com/v2` |
| Credentials | API key **and** secret | API key only |
| Header | `Authorization: Basic base64(key:secret)` | `x-api-key: <key>` |
| Encoding | Form-encoded | JSON |
| Channels | SMS | SMS, MMS, WhatsApp, RCS |

Pick the connection that matches the modules you are using. A V2 key will not
authenticate a V1 module and the reverse is equally true — these are different
credentials, not the same credential sent two ways.

## Which one do I have?

If your Kudosity account predates the v2 API, or you are already integrating through
Salesforce or Eloqua, you are on v1 — those integrations use it. If you were issued a
single API key with no secret, you are on v2.

## The two are not interchangeable

A V2 key will not authenticate a V1 module and the reverse is equally true. This was
tested directly on 22 Oct 2026: a V2 sandbox key was rejected by every V1 endpoint under
Basic `key:`, Basic `:key`, Basic `key:key`, a raw header, `Bearer`, `x-api-key` and a
query parameter. The same key returned 200 against V2 with `x-api-key`.

V1 needs **both** the key and its secret. V2 needs **only** the key.

## One host, two APIs

`api.transmitsms.com` will answer v2 routes under `/v2/`, so in principle a single base
URL could serve both. The app does not do this. The v2 modules stay on
`api.transmitmessage.com`, which is the documented host and the one they were built
against; moving proven traffic to a host that merely appears to work would be a risk
taken for no benefit.
