---
name: weekly-decisions
description: Walk the manager through this week's decision queue for the AI agents their company employs, one item at a time, and put each decision on record. Needs a Metrx API key with the read scope to read the queue and the write scope to record a decision.
---

# Weekly decisions

The queue holds the items that need a person: an agent with no job
contract, an idle agent, a proposal to approve, a blocked signal, a cascade
graduation, a breaker that fired, evidence about to expire. The manager
decides; Metrx records.

## Steps

1. Call `metrx_get_decision_queue`. It needs a Metrx API key with the `read`
   scope; without one it returns `auth_required`. Relay that
   `user_message` and point at `/metrx-desk:connect-metrx`.
2. Relay the queue header: how many items, how many snoozed, and whether
   the list is truncated.
3. Go through the items in queue order. Each item has a `kind`; this
   version of the plugin knows these seven:

   | kind               | What the manager decides                                                                                           |
   | ------------------ | ------------------------------------------------------------------------------------------------------------------ |
   | `no_contract`      | Give this agent a job contract (draft one with `/metrx-desk:draft-job-contract`) or retire it.                     |
   | `idle_agent`       | The agent has made no call for longer than the threshold: retire, combine into another agent, or keep and say why. |
   | `proposal`         | A routing or model change with a measured trial behind it: approve or decline.                                     |
   | `blocked_signal`   | A trial cannot run because a signal is missing: supply it or drop the trial.                                       |
   | `cascade_approval` | A shadow sample finished: approve graduation to live traffic or hold.                                              |
   | `breaker_ack`      | A breaker rolled an actuation back: acknowledge that you have seen it.                                             |
   | `expiring_verdict` | Evidence is about to age out: act on it or let it expire.                                                          |

   For a kind not in this table, relay the item's `title`, `detail` and
   `evidence_link` as given and say the plugin does not yet know this kind.

4. For each item, show the title, the detail, the age in days and the
   evidence link, then the item's `actions` by label. Ask what they want
   to do. Approve, snooze, acknowledge and dismiss are taken in the Metrx
   dashboard at the evidence link; this plugin does not perform them.
5. When the manager decides to **expand**, **re-specify**, **combine** or
   **retire** an agent, call `metrx_record_decision` with `agent_key`,
   `decision` (`expand`, `re_specify`, `combine`, `retire`), a `rationale`
   of at least 20 characters in the manager's own words, and for `combine`
   the `combined_into_agent_id`. Pass an `idempotency_key` built from the
   agent key and today's date so a retry does not record twice. This needs
   the `write` scope; on `insufficient_scope`, relay the `user_message`.
6. Close with one line per decision recorded: kind, agent, date. These are
   the "Decisions on record" the next review shows.

## Rules

- Figures in the queue items carry labels; keep them.
- Do not decide for the manager, and do not record a decision they did not
  state.
