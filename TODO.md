# TODO — Kudosity custom app for Make

Status as of **21 Oct 2026**. Last commit 26 Aug 2026; three commits, 8 weeks idle. Local
and `origin/main` are in sync, so nothing is outstanding elsewhere.

Not tracked in Jira. There is no general integrations project — the convention is one per
integration (SAL Salesforce, EQ Eloqua, SI Shopify) and none exists for Make. This file is
the task list until that decision is made.

## What exists

| Piece | State |
|---|---|
| `base.imljson` | Base URL, auth header, error rendering |
| `connections/kudosity/` | API-key connection |
| `modules/v2Send{Sms,Mms,WhatsApp,Rcs}/` | Four v2 send modules, `api` + `parameters` each |
| `webhooks/v2Events/` | v2 trigger, one subscription per event type |
| `connections/kudosity-v1/` | v1 connection — Basic `key:secret`, secret optional |
| `modules/v1*` | Eight v1 modules: send, cancel, delivery status, format number, sender ids, account, numbers, replies |
| `webhooks/v1Inbound/` | v1 trigger — registers a number's forward URL, clears it on detach |
| `docs/` | User-facing help text for the app and all five modules |

Endpoints mirror the n8n integration: `POST /sms`, `/mms`, `/whatsapp/messages`,
`/rcs/messages` against `https://api.transmitmessage.com/v2`, with a raw
`Authorization: <api key>` header and **no** `Bearer` prefix.

Further along than the n8n node in coverage — the docs are complete — but equally unproven.

## Blockers

### 1. Never imported into Make, never run

The app has not been loaded into the Apps Editor or executed against the live API. Nothing
below can be confirmed until it has been.

### 2. Two inferred details, both flagged in the README

Carried over from the n8n integration by assumption rather than observation:

- **Error shape.** `base.imljson` renders `body.error.message`, falling back to
  `body.message`. Adjust once a real error body has been seen.
- **Webhook attach payload.** `attach.imljson` sends an `event_type` field. The n8n
  integration sends only `url` and `webhook_name` and registers a separate webhook per
  event type. If Kudosity ignores `event_type` and sends every type to the URL, drop the
  field and add a filter after the trigger instead.

### 3. `interface.imljson` and `samples.imljson` are absent

Deliberately — they should be generated in the Apps Editor from real responses rather than
hand-written. Blocked on the first live run.

## Then

- Run each of the four send modules against a real account.
- Register a webhook, send a real inbound message, and confirm the trigger fires with the
  payload the docs describe.
- Decide whether a failed send should stop the scenario or take the **Ignore** route — the
  README raises this and leaves it open.
- Submit for Make app review once the above is proven. The `docs/` section exists
  specifically for that review.

## Shared with the n8n node

Both integrations hit the same API and carry the **same unresolved question** about
per-event-type webhook registration. Answering it once with a live account settles it for
both — worth doing before either goes further. See `../kudosity-n8n/TODO.md`.
