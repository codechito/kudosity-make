# Kudosity

The Kudosity modules let you send SMS, MMS, WhatsApp and RCS messages, and start scenarios
when a message arrives, a delivery receipt comes back, a recipient opts out, or someone
clicks a tracked link.

[Kudosity](https://kudosity.com) is a business messaging platform. You need a Kudosity
account with the relevant channels provisioned before you can use these modules.

## Getting your API key

1. Sign in to your Kudosity account.
2. Go to **Settings > API**.
3. Copy the API key.

Keep the key secret — it grants full send access to your account, and messages cost money.

## Connecting Kudosity to Make

1. Add any Kudosity module to your scenario.
2. Next to **Connection**, click **Add**.
3. Give the connection a name that identifies the account, for example
   `Kudosity — production`.
4. Paste your API key into the **API Key** field.
5. Click **Save**.

Make verifies the key immediately. A green tick means you are connected.

You only create the connection once — every other Kudosity module in any scenario can reuse
it from the dropdown.

### If the connection fails

- **Invalid key** — recheck **Settings > API** in Kudosity; the key may have been rotated.
- **403 or permission errors** — the key is valid but your account may not have API access
  enabled. Contact Kudosity support.

## Modules

### Actions

| Module | What it does |
|---|---|
| **Send an SMS** | Sends a text message |
| **Send an MMS** | Sends a message with an image or other media attached |
| **Send a WhatsApp Message** | Sends a WhatsApp message |
| **Send an RCS Message** | Sends a rich RCS message |

### Triggers

| Module | What it does |
|---|---|
| **Watch Events** | Starts the scenario when a chosen Kudosity event occurs |

## Common fields

Every send module shares these:

- **Sender** — the sender ID or virtual number the message comes from. It must already be
  on your Kudosity account.
- **Recipient** — the destination number in international E.164 format, for example
  `+61412345678`. Numbers in local format are rejected.
- **Message** — the message body.
- **Message Reference** — optional. Your own identifier, returned on the matching status
  event. Use it to tie a delivery receipt back to the record that triggered the send.

## Channel availability

SMS works on any Kudosity account. MMS, WhatsApp and RCS each need that channel provisioned
and an approved sender. If a send fails with a sender or channel error, the channel is not
enabled on your account — that is an account setting, not a scenario problem.

## Costs

Every successful send is billed by Kudosity at your account rate. Test scenarios with a
small number of real recipients, and be careful with modules that iterate over a list.
