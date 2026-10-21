# Send SMS (V1)

Sends a text message through the Kudosity v1 API. Requires a **Kudosity V1** connection.

## Fields

| Field | Required | Notes |
|---|---|---|
| To | Yes | Recipient number. Pair with Country Code for local-format numbers. |
| Message | Yes | The message body. |
| From | No | Sender ID or virtual number. Blank uses the account default. |
| Country Code | No | Two-letter code (e.g. `AU`) used to expand local-format numbers. |
| Tracked Link URL | No | URL to shorten and track. Put `[tracked-link]` in the message where the short link should appear. |
| Validity (Minutes) | No | Abandon delivery after this long. Blank leaves it to the carrier. |
| Send At | No | `YYYY-MM-DD HH:MM:SS` to schedule. Blank sends immediately. |
| Delivery Receipt Callback URL | No | Where delivery receipts are POSTed. |
| Reply Callback URL | No | Where replies to this message are POSTed. |
| Link Hits Callback URL | No | Where tracked-link clicks are POSTed. |

## Receiving the callbacks

The three callback URLs are how v1 reports back on a message. They are set per send, not
subscribed to once. To use them, add a **Watch Inbound Messages** webhook to your
scenario, copy its URL, and paste it into whichever callback fields you need.

This is different from the V2 trigger, which registers a subscription per event type and
needs no per-send wiring.
