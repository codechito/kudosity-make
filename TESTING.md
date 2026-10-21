# First live test — Make

The app has never been imported into Make or run against the real API. Several details in
it are inferred from the n8n integration and the Kudosity Salesforce and Eloqua
integrations rather than observed. This is the run that settles them.

Work top to bottom. Each step says what to record, because later decisions depend on
earlier answers.

Related: `../kudosity-n8n/TESTING.md`. Two questions are shared between the two
integrations — **step 2** and **step 8** below answer the same things as steps 2 and 8
there. If you have already done the n8n run, carry those answers over and skip the
duplicate work.

---

## Before you start

You need:

- A Make account, and an API token with `sdk-apps:read` and `sdk-apps:write`
  (**Profile → API access → Add token**)
- A Kudosity account with credit
- **A spare virtual number** — see the warning at step 7. Not one that feeds Salesforce
  or Eloqua.
- A real handset you can send to and reply from

---

## 1. Import the app

Follow **Option A** in the README — the VS Code Make Apps Editor extension. It keeps the
app in sync with this repo, which matters because you will be editing files as the live
testing corrects them.

Create the app, then copy in, in this order:

| Order | From | Into |
|---|---|---|
| 1 | `base.imljson` | App → Base |
| 2 | `connections/kudosity-v2/*` | Connections → add **API Key** type |
| 3 | `connections/kudosity-v1/*` | Connections → add a **second** |
| 4 | `webhooks/v2Events/*` | Webhooks → add |
| 5 | `webhooks/v1Inbound/*` | Webhooks → add a second |
| 6 | `modules/v2*` | Modules → add as **Action**, four of them |
| 7 | `modules/v1*` | Modules → add as **Action**, eight of them |

**Base before everything else.** The v2 modules inherit their host and auth header from
it, so they will not work until it exists.

⚠️ **Each module must be bound to the right connection.** The twelve modules split eight
v1 / four v2, and a v1 module left on the v2 connection fails to authenticate with an
error that points at the request rather than the binding. This is the single easiest thing
to get wrong here and the hardest to diagnose.

---

## 2. The question that blocks everything else

**Does the v1 API accept the API key with no secret?**

Both this app and the n8n package mark the v1 secret optional, pending this answer.

1. Create a connection using **Kudosity V1**. Fill in the API Key, **leave API Secret
   blank**.
2. Click to verify it. The connection tests against `GET /get-client.json` — read-only,
   costs nothing, sends nothing.

| Result | Meaning | Do this |
|---|---|---|
| Connects | The key alone is enough | Record it. Leave the secret optional in both this app and n8n |
| Rejected | The secret is required | Fill it in, retry, then make the field `"required": true` in `connections/kudosity-v1/parameters.imljson` and match it in n8n |

Then verify the **Kudosity V2** connection the same way. It tests against
`GET /sms?limit=1`.

**Record:** which, and the exact error text if either failed.

---

## 3. Read-only v1 modules

Cheapest way to prove the request shapes before spending credit. Run each once in a
scenario:

| Module | Expect |
|---|---|
| Get Account | Account details and balance |
| Get Numbers | Your virtual numbers — **note a spare one for step 7** |
| Get Sender IDs | Sender IDs on the account |
| Format Number | `0412345678` + `AU` → international format |

**Record:** any error, with the full body. See step 6 — the error shape is itself an open
question.

---

## 4. Generate interfaces and samples

`interface.imljson` and `samples.imljson` are deliberately absent from this repo. They
should be generated from real responses rather than hand-written, which is only possible
once the modules return something.

For each module you have now run, use the Apps Editor's response mapping to capture the
real output into its `interface` and `samples` sections.

**Do this before the sends**, so each send module's output is mapped the first time it
returns rather than being re-run later.

**Record:** copy the generated files back into this repo so the two do not drift.

---

## 5. v1 send

**Send SMS (V1)** to your own handset.

- **To** — your number
- **Message** — anything
- **From** — blank first, to confirm the account default works

Then a second run with **Country Code** `AU` and a local number like `0412345678` — the
case the Salesforce package handles specially.

Then, using the returned ID: **Get Delivery Status**, and **Cancel SMS** against a message
sent with **Send At** a few minutes ahead.

**Record:** the response JSON, and whether `get-delivery-status.json` wants `message_id`
or something else. That endpoint came from the Eloqua integrator, not documentation.

---

## 6. v2 modules, and the error shape

On the **Kudosity V2** connection:

| Module | Note |
|---|---|
| Send an SMS | Baseline |
| Send an MMS | Needs a publicly reachable image URL |
| Send a WhatsApp Message | Text needs an opted-in recipient; Template needs an approved name |
| Send an RCS Message | Once with an SMS fallback sender, once without |

**Then deliberately cause an error** — a malformed recipient, or a send with no credit.

`base.imljson` renders errors as `body.error.message`, falling back to `body.message`,
falling back to the whole body. That chain is a guess.

**Record:** the raw error body. If neither field exists, `base.imljson` needs correcting —
and the n8n package needs the same fix.

---

## 7. The v1 inbound webhook — read this first

⚠️ **Attaching this overwrites the virtual number's forward URL.**

A v1 number has exactly one forward URL. Whatever it currently points at stops receiving
the moment you attach. If that number feeds a Salesforce org or an Eloqua instance, that
feed breaks silently and nothing warns either side.

**There is no API to read the current value back**, so it cannot be recorded first or
restored afterwards. Use a spare number from step 3.

1. Add **Watch Inbound Messages (V1)** to a scenario, set **Virtual Number**
2. Turn the scenario on — this writes the forward URL
3. Text that number from your handset
4. The scenario should run, with `phone`, `message` and `raw` populated
5. Turn it off and confirm the forward URL is blanked

**Record:** the `raw` payload. The mapping reads `mobile`/`msisdn`/`from` for the sender
and `response`/`message` for the text, because v1 varies by callback type. The raw payload
lets that be narrowed to what is real.

---

## 8. The v2 webhook — the other open question

**Does Kudosity register one webhook per event type, or send everything to one URL?**

`webhooks/v2Events/attach.imljson` sends an `event_type` field and assumes per-type
registration. So does the n8n trigger.

1. Add **Watch Events (V2)**, choose one event type
2. Turn the scenario on
3. In the Kudosity portal, check **Settings → Webhooks**

| What you see | Meaning |
|---|---|
| An entry named `Make - <type>`, scoped to that type | The assumption holds |
| One entry receiving everything | `event_type` is ignored. Drop it from `attach.imljson` and filter after the trigger — and fix n8n the same way |

4. Send a real inbound and confirm the scenario runs
5. Turn it off and confirm the webhook is removed

**Record:** how many entries appeared and their names.

---

## 9. Documentation, then submit

Once the above is correct:

1. Paste the `docs/` text into the app's Docs sections — mapping in `docs/README.md`
2. Follow the README's Setup section literally in a clean browser, to catch steps that no
   longer match Make's UI
3. Submit for Make review

Review is an external queue. Submission is not approval, and there is no slack behind it
in the November plan.

---

## What to bring back

1. **Does v1 work without the secret?** (step 2)
2. **One webhook per event type, or one for everything?** (step 8)
3. **What a real error body looks like** (step 6)
4. **The raw v1 inbound payload** (step 7)
5. **The generated `interface`/`samples` files** (step 4)

The first two change both this app and the n8n package. The rest are corrections here.

---

## If something is broken

Nothing is published and no customer scenario depends on this app, so the blast radius is
the app itself — delete or edit it in the Apps Editor.

The one action with an effect outside Make is **step 7**, overwriting a number's forward
URL. That is also the only thing that cannot be undone by deleting the app, because the
value lives on the Kudosity account rather than in Make.
