# Make documentation source

These files are the **user-facing documentation shown inside Make**, not documentation for
this repository. They are kept here so the text is version-controlled and reviewable;
paste them into the app's Docs sections in the Make Apps Editor.

The repository's own README, aimed at whoever maintains the app, is one level up.

| File | Goes in |
|---|---|
| `app.md` | App → **Docs** tab |
| `connections.md` | App → **Docs**, below `app.md` — explains which connection an account needs |
| `modules/send-sms.md` | Module *Send an SMS (V2)* → **Docs** |
| `modules/send-mms.md` | Module *Send an MMS* → **Docs** |
| `modules/send-whatsapp.md` | Module *Send a WhatsApp Message* → **Docs** |
| `modules/send-rcs.md` | Module *Send an RCS Message* → **Docs** |
| `modules/watch-events.md` | Module *Watch Events (V2)* → **Docs** |
| `modules/v1-send-sms.md` | Module *Send an SMS (V1)* → **Docs** |
| `modules/v1-watch-inbound.md` | Module *Watch Inbound Messages (V1)* → **Docs** |

The remaining v1 modules — cancel, delivery status, format number, sender ids, account,
numbers, replies — are single-field lookups whose parameter help text is enough. Write
Docs entries for them only if Make's review asks.

If you edit the docs in Make's web editor, copy the changes back here so the two do not
drift.

## Writing conventions

Make's review team expects documentation written for the person building a scenario, not
for a developer reading the API. When editing these files:

- Describe what a field means to the user, not what it maps to in the payload.
- Say how to obtain credentials, step by step, with the exact menu names.
- Note anything that costs money, is rate limited, or can fail for reasons outside the
  scenario — provisioning, approvals, carrier support.
- Use the module labels as they appear in the UI ("Send an SMS"), not the internal names
  (`sendSms`).
