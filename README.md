# Kudosity custom app for Make

A [Make](https://www.make.com) custom app for the Kudosity messaging API — send SMS, MMS,
WhatsApp and RCS messages, and trigger scenarios from inbound messages, delivery receipts,
opt-outs and link hits.

Sibling integrations: [`kudosity-n8n`](https://github.com/codechito/kudosity-n8n),
[`n8n-nodes-kudosms`](https://github.com/codechito/n8n-nodes-kudosms).

## Status

Scaffold. The structure and endpoints are in place and mirror the n8n integration, but the
app has not yet been imported into the Make Apps Editor or run against the live API.
See [Validating](#validating) before relying on it.

## API

| | |
|---|---|
| Base URL | `https://api.transmitmessage.com/v2` |
| Auth | `Authorization: <api key>` header — a raw key, **no** `Bearer` prefix |
| Docs | <https://developers.kudosity.com> |

Get an API key from your Kudosity account under **Settings > API**.

## Layout

```
base.imljson                      Base URL, auth header, error handling
connections/kudosity/             API-key connection + validation request
modules/
  sendSms/                        POST /sms
  sendMms/                        POST /mms
  sendWhatsApp/                   POST /whatsapp/messages
  sendRcs/                        POST /rcs/messages
webhooks/events/                  Managed webhook trigger
```

Each module directory holds `api.imljson` (the request) and `parameters.imljson` (the
fields shown in the scenario editor).

### Webhook trigger

`webhooks/events/` registers a managed webhook, so Make creates and deletes it on the
Kudosity side automatically:

- **attach** — `POST /webhook` with the Make-supplied URL, storing the returned id
- **detach** — `DELETE /webhook/{id}` when the trigger is removed
- **api** — passes the inbound payload straight through as module output

Supported event types: `SMS_INBOUND`, `SMS_STATUS`, `MMS_INBOUND`, `MMS_STATUS`,
`RCS_STATUS`, `OPT_OUT`, `LINK_HIT`.

One webhook is registered per trigger instance. To listen to several event types, add a
trigger module for each.

## Validating

1. Install the **Make Apps Editor** extension for VS Code and log in to your Make org.
2. Create a new app, then copy these files into it (or point the extension at this clone).
3. Set an API key on the connection and run the connection test — it issues
   `GET /sms?limit=1` and should return 200.
4. Run each module once with a real recipient before publishing.

Two things to confirm against live responses, since they were inferred from the n8n
integration rather than observed:

- **Error shape.** `base.imljson` renders errors as `body.error.message`, falling back to
  `body.message`. Adjust once you have seen a real error body.
- **Webhook attach payload.** The n8n integration sends `url` and `webhook_name`; the
  `event_type` field here is assumed. Confirm how Kudosity scopes a webhook to one event
  type, and whether it returns `id` at the top level.

Neither module `interface.imljson` nor `samples.imljson` files are included — generate
them in the Apps Editor from a real response, which is more reliable than hand-writing them.

## Licence

MIT
