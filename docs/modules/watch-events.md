# Watch Events

Starts the scenario when a Kudosity event occurs. This is an instant trigger — it runs as
soon as the event happens, with no polling.

## Parameters

| Field | Required | Description |
|---|---|---|
| **Connection** | yes | Your Kudosity connection. |
| **Event Type** | yes | The event to listen for. |

## Event types

| Event type | Fires when |
|---|---|
| **SMS Inbound** | Someone replies to, or texts, your number. |
| **SMS Status** | A delivery receipt arrives for an SMS you sent. |
| **MMS Inbound** | An inbound MMS arrives. |
| **MMS Status** | A delivery receipt arrives for an MMS. |
| **RCS Status** | A delivery receipt arrives for an RCS message. |
| **Opt Out** | A recipient unsubscribes. |
| **Link Hit** | A recipient clicks a tracked link. |

## Output

The Kudosity event payload, passed through as the trigger bundle. Fields vary by event
type. Run the trigger once and inspect the output to see exactly what a given event
returns before mapping from it.

For status events, the **Message Reference** you set when sending is included — use it to
match the receipt to your own records.

## Notes

- **The webhook is managed for you.** Make registers it with Kudosity when you turn the
  scenario on and removes it when you delete the trigger. Do not create webhooks manually
  in Kudosity for this scenario; it will interfere with that lifecycle.
- **One event type per trigger, and Make allows one trigger per scenario.** To react to
  more than one event type, build a separate scenario for each.
- Turning the scenario off leaves the webhook registered so events resume when you turn it
  back on. Deleting the trigger removes it.
