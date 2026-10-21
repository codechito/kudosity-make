# Watch Inbound Messages (V1)

Starts a scenario when a message arrives on a Kudosity virtual number. Requires a
**Kudosity V1** connection.

## How v1 inbound works

A virtual number carries a single **forward URL**. Every inbound message to that number
is POSTed there. Turning this webhook on writes your Make webhook URL into that field;
turning it off clears it.

## Before you turn it on

**This replaces whatever the number's forward URL was set to.** If the number already
feeds another system — a Salesforce or Eloqua integration, say — that feed stops the
moment this webhook is attached, with no warning on either side.

Kudosity offers no way to read a forward URL back, so the previous value cannot be
recorded or restored. If the number is in use elsewhere, use a different number, or use
the **Get Replies** module to poll instead.

## Output

| Field | Notes |
|---|---|
| phone | The sender. v1 calls this `mobile`, `msisdn` or `from` depending on the callback. |
| id | Message ID, from `message_id` or `id`. |
| message | Message text, from `response` or `message`. |
| status | Present on delivery receipts. |
| to | The virtual number that received it. |
| received_at | Timestamp, from `datetime` or `received_at`. |
| raw | The untouched payload, so nothing is lost if a field above is empty. |
