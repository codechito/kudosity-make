# TODO — Kudosity custom app for Make

Tasks are tracked in Jira, in the **SAL** project (Salesforce Integration) under the label
`make`. That is a temporary home until an integrations project exists. Moved there on
3 Nov 2026; this file is no longer the task list.

All Make tickets: https://kudosity.atlassian.net/issues/?jql=project%3DSAL%20AND%20labels%3Dmake

## Open

| Ticket | Task |
|---|---|
| [SAL-98](https://kudosity.atlassian.net/browse/SAL-98) | Import the app into the Apps Editor and validate connections |
| [SAL-99](https://kudosity.atlassian.net/browse/SAL-99) | Generate interface and samples from real responses, smoke test V2 modules |
| [SAL-100](https://kudosity.atlassian.net/browse/SAL-100) | Smoke test the V1 modules and V1 inbound webhook |
| [SAL-101](https://kudosity.atlassian.net/browse/SAL-101) | Decide failed-send behaviour (stop vs Ignore route) |
| [SAL-102](https://kudosity.atlassian.net/browse/SAL-102) | Submit the app for Make review |
| [SAL-94](https://kudosity.atlassian.net/browse/SAL-94) | Tag API requests with source, version and action headers (shared with n8n) |
| [SAL-103](https://kudosity.atlassian.net/browse/SAL-103) | Provision WhatsApp and RCS senders, or document the limit (shared with n8n) |
| [SAL-104](https://kudosity.atlassian.net/browse/SAL-104) | Decide whether to move the repo to a company GitHub org (shared with n8n) |

## Done

| Ticket | Work | Completed |
|---|---|---|
| [SAL-112](https://kudosity.atlassian.net/browse/SAL-112) | Scaffold the custom app, README and review docs | 26 Aug 2026 |
| [SAL-113](https://kudosity.atlassian.net/browse/SAL-113) | Cover both APIs — V1 connection, modules and inbound webhook | 21 Oct 2026 |
| [SAL-114](https://kudosity.atlassian.net/browse/SAL-114) | Fix V2 authentication and render the real API error shapes | 22 Oct 2026 |
| [SAL-115](https://kudosity.atlassian.net/browse/SAL-115) | Webhook event-type filter, delivery-status endpoint and V1 credential | 22 Oct 2026 |

Put the ticket key in commit messages (e.g. `fix: ... (SAL-98)`), as the Salesforce repos do.
