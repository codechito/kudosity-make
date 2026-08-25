# Send a WhatsApp Message

Sends a WhatsApp message to a single recipient.

## Parameters

| Field | Required | Description |
|---|---|---|
| **Connection** | yes | Your Kudosity connection. |
| **Sender** | yes | WhatsApp-enabled sender registered with Kudosity. |
| **Recipient** | yes | Destination number in E.164 format, e.g. `+61412345678`. |
| **Message** | yes | The message body. |
| **Message Reference** | no | Your own identifier for correlating status events. |

## Output

Kudosity's response for the send, including the message id and initial status.

## Notes

- WhatsApp restricts business-initiated messages outside a 24-hour customer service
  window to pre-approved message templates. If you are messaging someone who has not
  contacted you recently, the send may be rejected unless a template is used.
- Requires a WhatsApp sender provisioned on your Kudosity account.
