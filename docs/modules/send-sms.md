# Send an SMS

Sends a text message to a single recipient.

## Parameters

| Field | Required | Description |
|---|---|---|
| **Connection** | yes | Your Kudosity connection. |
| **Sender** | yes | Sender ID or virtual number on your Kudosity account. |
| **Recipient** | yes | Destination number in E.164 format, e.g. `+61412345678`. |
| **Message** | yes | The text to send. |
| **Message Reference** | no | Your own identifier, returned on the `SMS_STATUS` event. |

## Output

The module returns Kudosity's response for the send, including the message id and its
initial status. Map these into later modules as needed.

Note that a successful response means Kudosity **accepted** the message, not that it was
delivered. Delivery is confirmed later by an `SMS_STATUS` event — see **Watch Events**.

## Notes

- Messages longer than 160 GSM-7 characters are split into multiple parts and billed per
  part. Non-GSM characters, including most emoji, reduce the limit to 70 characters
  per part.
- Set **Message Reference** to something that identifies the record you are messaging
  about, such as a CRM contact id. Without it, delivery receipts arrive with no way to
  match them to your data.
