# Kudosity custom app for Make

A [Make](https://www.make.com) custom app for the Kudosity messaging API — send SMS, MMS,
WhatsApp and RCS messages, and start scenarios from inbound messages, delivery receipts,
opt-outs and link hits.

Sibling integrations: [`kudosity-n8n`](https://github.com/codechito/kudosity-n8n),
[`n8n-nodes-kudosms`](https://github.com/codechito/n8n-nodes-kudosms).

- [Setup](#setup) — one-off, done by you in Make
- [Usage](#usage) — how the app is used inside a scenario

## Status

Scaffold. Endpoints and auth mirror the working n8n integration, but the app has not yet
been imported into Make or run against the live API. Two details are inferred rather than
observed — see [Confirm against the live API](#confirm-against-the-live-api).

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
   | 2 | Connections → add, type **API Key** → Communication | `connections/kudosity/api.imljson` |
   | 3 | Connections → same connection → Parameters | `connections/kudosity/parameters.imljson` |
   | 4 | Webhooks → add, type **Webhook** → Communication | `webhooks/events/api.imljson` |
   | 5 | Webhooks → same → Attach / Detach | `webhooks/events/attach.imljson`, `detach.imljson` |
   | 6 | Webhooks → same → Parameters | `webhooks/events/parameters.imljson` |
   | 7 | Modules → add, type **Action** | `modules/sendSms/*`, then the other three |
   | 8 | Modules → add, type **Instant trigger**, linked to the webhook above | — |

   For each module, `api.imljson` goes in the **Communication** tab and
   `parameters.imljson` in the **Mappable parameters** tab.

## Verify the connection

Before touching any modules:

1. Create a new scenario and drop in the **Send SMS** module.
2. Click **Create a connection**, name it something like `Kudosity — production`, and paste
   your API key.
3. Save. Make immediately fires the validation request in
   `connections/kudosity/api.imljson` — a `GET /sms?limit=1`.

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

## Publish

A custom app is private to your organisation by default, which is almost certainly what you
want here. Anyone in the org can use it in their scenarios straight away.

To list it publicly in Make's app directory, use **Request app review** in the app settings.
That kicks off a review by Make and requires the Docs section to be filled in.

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

- **Error shape.** `base.imljson` renders errors as `body.error.message`, falling back to
  `body.message`. Adjust once you have seen a real error body.
- **Webhook attach payload.** The n8n integration sends only `url` and `webhook_name`, and
  registers a *separate* webhook per event type. The `event_type` field in
  `attach.imljson` is an assumption — Kudosity may ignore it and send all event types to
  the URL, in which case add a filter after the trigger and drop the field.

Module `interface.imljson` and `samples.imljson` files are intentionally absent. Generate
them in the Apps Editor from a real response rather than hand-writing them.

## Licence

MIT
