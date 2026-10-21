# Connections

The app has two connections, because Kudosity has two APIs and they do not share an
authentication scheme.

| | Kudosity V1 | Kudosity V2 |
|---|---|---|
| Host | `api.transmitsms.com` | `api.transmitmessage.com/v2` |
| Credentials | API key **and** secret | API key only |
| Header | `Authorization: Basic base64(key:secret)` | `Authorization: <key>` — raw, no `Bearer` |
| Encoding | Form-encoded | JSON |
| Channels | SMS | SMS, MMS, WhatsApp, RCS |

Pick the connection that matches the modules you are using. A V2 key will not
authenticate a V1 module and the reverse is equally true — these are different
credentials, not the same credential sent two ways.

## Which one do I have?

If your Kudosity account predates the v2 API, or you are already integrating through
Salesforce or Eloqua, you are on v1 — those integrations use it. If you were issued a
single API key with no secret, you are on v2.

## About the V1 secret

The V1 connection marks the secret optional. Try connecting with the key alone first;
if Kudosity rejects it, add the secret. This is left to the connection test rather than
assumed either way, because it has not been confirmed against the live API.

## One host, two APIs

`api.transmitsms.com` will answer v2 routes under `/v2/`, so in principle a single base
URL could serve both. The app does not do this. The v2 modules stay on
`api.transmitmessage.com`, which is the documented host and the one they were built
against; moving proven traffic to a host that merely appears to work would be a risk
taken for no benefit.
