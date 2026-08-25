# Send an RCS Message

Sends a rich RCS message to a single recipient.

## Parameters

| Field | Required | Description |
|---|---|---|
| **Connection** | yes | Your Kudosity connection. |
| **Sender** | yes | RCS agent registered with Kudosity. |
| **Recipient** | yes | Destination number in E.164 format, e.g. `+61412345678`. |
| **Message** | yes | The message body. |
| **Message Reference** | no | Your own identifier, returned on the `RCS_STATUS` event. |

## Output

Kudosity's response for the send, including the message id and initial status.

## Notes

- RCS is only delivered to handsets and carriers that support it. Confirm with Kudosity
  how your account handles recipients who cannot receive RCS — some setups fall back to
  SMS automatically, others fail the send.
- Requires an RCS agent provisioned on your Kudosity account.
