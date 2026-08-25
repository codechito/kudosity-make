# Send an MMS

Sends a message with an image or other media attached.

## Parameters

| Field | Required | Description |
|---|---|---|
| **Connection** | yes | Your Kudosity connection. |
| **Sender** | yes | Sender ID or virtual number on your Kudosity account. |
| **Recipient** | yes | Destination number in E.164 format, e.g. `+61412345678`. |
| **Media URL** | yes | Publicly reachable URL of the media to attach. |
| **Subject** | no | Subject line shown on handsets that support it. |
| **Message** | no | Text accompanying the media. |
| **Message Reference** | no | Your own identifier, returned on the `MMS_STATUS` event. |

## Output

Kudosity's response for the send, including the message id and initial status.

## Notes

- **Media URL must be publicly reachable.** Kudosity fetches the file from that URL, so
  links behind authentication, on a private network, or with a short-lived signature that
  has already expired will fail. If you are generating the file in the same scenario,
  upload it somewhere public first.
- MMS must be enabled on your Kudosity account. If sends fail with a channel or sender
  error, contact Kudosity rather than changing the scenario.
