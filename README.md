# Kudosity custom app for Make

A [Make](https://www.make.com) custom app for the Kudosity messaging API — send SMS, MMS,
WhatsApp and RCS messages, and start scenarios from inbound messages, delivery receipts,
opt-outs and link hits.

Sibling integrations: [`kudosity-n8n`](https://github.com/codechito/kudosity-n8n),
[`n8n-nodes-kudosms`](https://github.com/codechito/n8n-nodes-kudosms).

- [Setup](#setup) — one-off, done by you in Make
- [Usage](#usage) — how the app is used inside a scenario
- [`docs/`](docs/) — the user-facing help text that goes into Make's Docs sections

## Status

Scaffold. Endpoints and auth mirror the working n8n integration, but the app has not yet
been imported into Make or run against the live API. Several details are inferred rather
than observed — see [Confirm against the live API](#confirm-against-the-live-api).

The app covers **both Kudosity APIs**, with a connection for each:

| | V1 | V2 |
|---|---|---|
| Host | `api.transmitsms.com` | `api.transmitmessage.com/v2` |
| Auth | Basic `key:secret` | `x-api-key: <key>` |
| Channels | SMS | SMS, MMS, WhatsApp, RCS |
| Inbound | A number's single forward URL | A subscription per event type |

V1 is the API the Kudosity Salesforce and Eloqua integrations use; its endpoints and
field names here are taken from those working calls. See [`docs/connections.md`](docs/connections.md)
for which one applies to a given account.

## API reference

| | |
|---|---|
| Base URL | `https://api.transmitmessage.com/v2` |
| Auth | `Authorization: <api key>` header — raw key, **no** `Bearer` prefix |
| Docs | <https://developers.kudosity.com> |

| Module | Method | Endpoint |
|---|---|---|
| Send SMS | `POST` | `/sms` |
| Send MMS | `POST` | `/mms` |
| Send WhatsApp | `POST` | `/whatsapp/messages` |
| Send RCS | `POST` | `/rcs/messages` |
| Webhook trigger | `POST` / `DELETE` | `/webhook`, `/webhook/{id}` |

---

# Setup

One-off work to get the app into your Make organisation. You only do this once; everyone
building scenarios afterwards just picks the modules off the palette.

## Before you start

- **A Make account with custom app access.** Custom apps are not on the free tier — you
  need a paid plan, and "Custom apps" must appear in the left-hand sidebar. If it doesn't,
  contact Make to have app development enabled for your organisation.
- **A Kudosity API key.** In your Kudosity account, go to **Settings > API** and copy the
  key. Treat it as a secret — it grants full send access.
- **Your Make region.** Note whether your org is on `eu1`, `eu2`, `us1`, etc. It appears in
  the URL when you are signed in, and the VS Code extension asks for it.

## Option A — VS Code extension (recommended)

Best if you want the app to stay in sync with this repo.

1. Install the **Make Apps Editor** extension from the VS Code marketplace.
2. In Make, generate an API token: **Profile > API access > Add token**, with the
   `sdk-apps:read` and `sdk-apps:write` scopes.
3. In VS Code, open the Make extension and add your environment — the region URL
   (e.g. `https://eu1.make.com`) and the token from step 2.
4. Create a new app in the extension with these values:

   | Field | Value |
   |---|---|
   | Name | `kudosity` |
   | Label | `Kudosity` |
   | Description | `Send SMS, MMS, WhatsApp and RCS messages via Kudosity` |
   | Theme | `#00A4E4` (or your brand colour) |
   | Language | `en` |
   | Countries | leave blank for global |

5. Clone this repo and copy the file contents into the matching sections of the new app.
   The directory layout maps one-to-one onto what the extension shows — see
   [Layout](#layout) below.

## Option B — Make web UI

Fine for a one-time import, but you will be pasting JSON by hand.

1. Go to **Custom apps** in the Make sidebar, then **Create a new app**, and fill in the
   same fields as the table above.
2. Open the new app. You will see tabs for **Base**, **Connections**, **Webhooks**,
   **Modules**, **RPCs**, **Functions** and **Docs**.
3. Paste each file from this repo into its matching tab, in this order — later steps
   reference earlier ones, so order matters:

   | Step | Where in Make | File from this repo |
   |---|---|---|
   | 1 | Base | `base.imljson` |
   | 2 | Connections → add, type **API Key** → Communication | `connections/kudosity-v2/api.imljson` |
   | 3 | Connections → same connection → Parameters | `connections/kudosity-v2/parameters.imljson` |
   | 4 | Connections → add a second, type **API Key** → Communication | `connections/kudosity-v1/api.imljson` |
   | 5 | Connections → same → Parameters | `connections/kudosity-v1/parameters.imljson` |
   | 6 | Webhooks → add, type **Webhook** → Communication | `webhooks/v2Events/api.imljson` |
   | 7 | Webhooks → same → Attach / Detach | `webhooks/v2Events/attach.imljson`, `detach.imljson` |
   | 8 | Webhooks → same → Parameters | `webhooks/v2Events/parameters.imljson` |
   | 9 | Webhooks → add a second | `webhooks/v1Inbound/*` — same three tabs |
   | 10 | Modules → add, type **Action** | `modules/v2SendSms/*`, then the other three v2 modules |
   | 11 | Modules → add the v1 modules | `modules/v1*` — eight of them, each with the **Kudosity V1** connection selected |

   Each module must be bound to the right connection. A v1 module on the v2 connection
   will fail to authenticate, and the error will not make the cause obvious.
   | 8 | Modules → add, type **Instant trigger**, linked to the webhook above | — |

   For each module, `api.imljson` goes in the **Communication** tab and
   `parameters.imljson` in the **Mappable parameters** tab.

## Verify the connection

Before touching any modules:

1. Create a new scenario and drop in the **Send SMS** module.
2. Click **Create a connection**, name it something like `Kudosity — production`, and paste
   your API key.
3. Save. Make immediately fires the validation request in
   `connections/kudosity-v2/api.imljson` — a `GET /sms?limit=1`. The v1 connection tests
   against `GET /get-client.json`.

A green tick means the key is good. An error means either the key is wrong or the auth
header shape has changed — check that the header is the raw key with no `Bearer` prefix.

## Smoke test each module

Run each module once, against your own mobile number, before letting anyone build on it:

1. Add **Send SMS**, pick the connection, set **Sender** to a sender ID or virtual number
   on your account, **Recipient** to your own number in E.164 (`+61412345678`), and a short
   **Message**.
2. Right-click the module and choose **Run this module only**.
3. Check the output bundle and confirm the message actually arrives.

Repeat for MMS (needs a publicly reachable **Media URL**), WhatsApp and RCS. Those three
require the relevant channel to be provisioned on your Kudosity account — if a send fails
with a sender or channel error, that is an account provisioning issue, not the app.

## Add the documentation

Every module and the app itself has a **Docs** section, holding the help text users see in
the scenario editor. The text lives in [`docs/`](docs/) in this repo so it stays
version-controlled — paste each file into its matching section:

| File | Goes in |
|---|---|
| `docs/app.md` | App → **Docs** |
| `docs/modules/send-sms.md` | *Send an SMS* → **Docs** |
| `docs/modules/send-mms.md` | *Send an MMS* → **Docs** |
| `docs/modules/send-whatsapp.md` | *Send a WhatsApp Message* → **Docs** |
| `docs/modules/send-rcs.md` | *Send an RCS Message* → **Docs** |
| `docs/modules/watch-events.md` | *Watch Events* → **Docs** |

Do this even if you never submit for review — it is what makes the app usable by anyone in
the org who did not build it.

## Publish

A custom app is private to your organisation by default, which is almost certainly what you
want here. Anyone in the org can use it in their scenarios straight away, and there is
nothing further to do.

### Submitting for app review

Only needed to list the app publicly in Make's directory. Use **Request app review** in the
app settings. Before submitting, work through this:

- [ ] **App icon** — a square PNG, 512×512. **Not yet available.** The only existing
      Kudosity asset is the n8n wordmark (218×48, white-on-transparent), which is the wrong
      shape and invisible on a light background. Ask for a square logomark from whoever
      owns brand assets.
- [ ] **Docs filled in** for the app and every module — see above.
- [ ] **Labels and descriptions** on every parameter, written for a scenario builder rather
      than an API consumer.
- [ ] **Connection validated** — the app must verify credentials on connect, which
      `connections/kudosity-v2/api.imljson` already does.
- [ ] **Errors surface usefully** — confirm `base.imljson` renders real Kudosity errors
      readably, not as a raw body dump. This is still unverified; see
      [Confirm against the live API](#confirm-against-the-live-api).
- [ ] **No secrets committed** anywhere in the app definition — keys belong in the
      connection only.
- [ ] **Every module tested** end to end against a live account.
- [ ] **Interface and sample data** generated for each module, so users see real output
      fields when mapping. These are deliberately absent from this repo.

Two of these — the icon and the interface/sample files — cannot be completed from this
repo alone, so budget for them before submitting.

## Layout

```
base.imljson                      v2 base URL, auth header, error handling

connections/
  kudosity-v2/                    Raw API-key connection + validation request
  kudosity-v1/                    Basic key:secret connection + validation request

modules/
  v2SendSms/                      POST /sms
  v2SendMms/                      POST /mms
  v2SendWhatsApp/                 POST /whatsapp/messages
  v2SendRcs/                      POST /rcs/messages
  v1SendSms/                      POST /send-sms.json
  v1CancelSms/                    POST /cancel-sms.json
  v1GetDeliveryStatus/            GET  /get-delivery-status.json
  v1FormatNumber/                 GET  /format-number.json
  v1GetSenderIds/                 GET  /get-sender-ids.json
  v1GetAccount/                   GET  /get-client.json
  v1GetNumbers/                   GET  /get-numbers.json
  v1GetReplies/                   GET  /get-sms-responses.json

webhooks/
  v2Events/                       Managed webhook, one subscription per event type
  v1Inbound/                      Writes a number's forward URL on attach, clears on detach

docs/                             User-facing help text for Make's Docs sections
```

`base.imljson` carries the **v2** host and header. The v1 modules override both with an
absolute URL and their own `Authorization`, so adding a v1 module does not require
touching the base.

Each module directory holds `api.imljson` (the request) and `parameters.imljson` (the
fields shown in the scenario editor).

---

# Usage

How the app behaves once it is installed — this is the part to hand to whoever is building
scenarios.

## Connecting

The first module you add asks for a connection. Create it once with your Kudosity API key
and every later module reuses it from a dropdown. You do not need a connection per module
or per scenario.

## Actions

All four send modules take the same core fields.

| Field | Required | Notes |
|---|---|---|
| **Sender** | yes | Sender ID or virtual number on your Kudosity account |
| **Recipient** | yes | E.164 format, e.g. `+61412345678` |
| **Message** | yes | The message body |
| **Message Reference** | no | Your own id, echoed back on status webhooks |

Channel-specific extras:

- **Send MMS** also takes **Media URL** (required, must be publicly reachable) and an
  optional **Subject**.
- **Send WhatsApp** needs a WhatsApp-enabled sender.
- **Send RCS** needs an RCS agent registered with Kudosity.

### Message Reference is the one to actually use

It looks optional and it is the field that makes delivery tracking work. Whatever you put
in **Message Reference** comes back on the `SMS_STATUS` webhook, so it is how you match a
delivery receipt to the record that triggered the send. Map your CRM record id, order
number, or ticket id into it.

Without it you get a delivery receipt you cannot attribute to anything.

## Trigger

**Watch Events** is an instant trigger. When you add it to a scenario and turn the scenario
on, Make registers a webhook with Kudosity automatically and deletes it when you remove the
trigger — there is nothing to configure on the Kudosity side.

Pick one event type per trigger:

| Event type | Fires when |
|---|---|
| `SMS_INBOUND` | someone replies to, or texts, your number |
| `SMS_STATUS` | a delivery receipt arrives for an SMS you sent |
| `MMS_INBOUND` | an inbound MMS arrives |
| `MMS_STATUS` | a delivery receipt arrives for an MMS |
| `RCS_STATUS` | a delivery receipt arrives for an RCS message |
| `OPT_OUT` | a recipient unsubscribes |
| `LINK_HIT` | a recipient clicks a tracked link |

**One event type per trigger, one trigger per scenario.** Make allows only a single trigger
in a scenario, so if you need to react to both inbound messages and delivery receipts,
build two scenarios. Do not try to work around this by registering webhooks manually — the
attach/detach lifecycle assumes Make owns them.

## Example scenarios

### Reply handling

```
Watch Events (SMS_INBOUND)  →  Router
                                 ├─ [message contains "STOP"]  →  Kudosity: opt out / CRM update
                                 └─ [otherwise]                →  Slack: post to #inbound-sms
```

Map `message` and `sender` from the trigger output into the downstream modules.

### Send and track

```
Watch Records (your CRM)  →  Send SMS
                              Sender:            your virtual number
                              Recipient:         {{contact.mobile}}
                              Message:           Hi {{contact.first_name}}, ...
                              Message Reference: {{contact.id}}     ← the important bit
```

Then a second scenario:

```
Watch Events (SMS_STATUS)  →  Update CRM record where id = {{message_ref}}
```

### Opt-out sync

```
Watch Events (OPT_OUT)  →  Update CRM: set marketing_opt_in = false
```

Worth building early. Acting on opt-outs is a compliance obligation, not a nice-to-have.

## Output and errors

Send modules return the Kudosity response as the output bundle — map fields from it into
later modules as normal. The trigger passes the webhook payload straight through.

On an API error the module fails with `[<status>] <message>` from Kudosity. Handle it the
usual Make way: right-click the module, **Add error handler**, then a **Resume** or
**Ignore** route depending on whether a failed send should stop the scenario.

For bulk sends, add a **Sleep** module or set the scenario to sequential processing if you
start hitting rate limits — Kudosity's published limits are in the
[API docs](https://developers.kudosity.com).

---

## Confirm against the live API

Two details were inferred from the n8n integration rather than observed, and should be
checked on first run:

- ~~**Error shape.**~~ **Answered 22 Oct 2026.** The two APIs differ, and neither used
  the field originally guessed at:

  There are four, not one. `error` is an **object** on v1 and a **string** on v2, and one
  response is not JSON at all:

  ```
  v1 Basic, bad creds   {"error":{"code":"AUTH_FAILED","description":"..."}}      error is an OBJECT
  v1 field error        {"error":{"code":"FIELD_EMPTY","description":"..."}}
  v1 non-Basic header   Authorisation failed                                     plain text, not JSON
  v2 bad key            {"status":"Unauthorized"} / {"status":"Invalid api key"}
  v2 simple validation  {"error":"sender: required"}                             error is a STRING
  v2 rich validation    {"error":{"detail":"Request validation failed",
                                  "issues":[{"message":"invalid sender","name":"sender"}],
                                  "title":"Invalid Request"}}                    RFC7807-ish
  ```

  Six shapes, and `error` is variously an object with `description`, an object with
  `detail` and `issues`, or a bare string.

  `base.imljson` now tries `body.error.description`, `body.error.message`, `body.error`,
  `body.status`, `body.message`, then the raw body — the third entry being what catches
  the string form. The plain-text case falls through to the raw body, which is already a
  readable sentence.

  Captured live — see `../kudosity-n8n/scripts/live-check.js`.
- **Webhook attach payload.** The n8n integration sends only `url` and `webhook_name`, and
  registers a *separate* webhook per event type. The `event_type` field in
  `attach.imljson` is an assumption — Kudosity may ignore it and send all event types to
  the URL, in which case add a filter after the trigger and drop the field.
- **Whether V1 accepts a key with no secret.** The V1 connection marks the secret
  optional so this can be settled by trying it. The Salesforce package sends
  `key:secret` and is proven; key-only is untested. If the connection test fails with the
  secret blank, make the field required.
- **V1 inbound field names.** `v1Inbound/api.imljson` reads `mobile`/`msisdn`/`from` and
  `response`/`message`, because v1 varies by callback type. The raw payload is passed
  through so a missed field can be recovered from a real event.

Module `interface.imljson` and `samples.imljson` files are intentionally absent. Generate
them in the Apps Editor from a real response rather than hand-writing them.

## Licence

MIT
