---
name: draft-job-contract
description: Draft a job contract for one AI agent from a Metrxbot template (support_triage, sdr_qualification, internal_assistant, coding_patch) with an objective, unit of work, acceptance criteria, budget and human baseline. Pure function, no key needed; publishing the draft is a separate, keyed step.
---

# Draft a job contract

A job contract is the written job an AI agent is employed to do: what it
owns, what one unit of work is, what counts as acceptable, what it may
spend, and what the same work costs when a person does it. Metrxbot scores the
agent against this contract.

## Steps

1. Collect from the person, asking only for what they have not said:
   - `template`: one of `support_triage`, `sdr_qualification`,
     `internal_assistant`, `coding_patch`.
   - `owner`: the accountable person (name or email). Required.
   - Optional: `agent_key`, `workload`, `objective`, `unit_of_work`,
     `budget_usd` with `budget_period` (`daily`, `weekly`, `monthly`),
     `vendor_name`, `billable_unit` (what the vendor bills per, such as
     `resolution`) and `vendor_resolved_definition` (the vendor's own wording,
     copied word for word), `human_baseline` (`cost_per_unit_usd`, optional `minutes_per_unit`,
     and `basis`, which says where the number comes from), `notes`.
     Do not guess the vendor terms either: ask for the vendor's wording, and pass
     it through unchanged.
     Do not guess the human baseline. If the person has no number, leave
     `human_baseline` out; the review will show "insufficient data" for the
     comparison, which is the honest state.
2. Call `metrx_draft_job_contract` with those fields. No key is needed; the tool
   reads nothing and stores nothing.
3. Relay the result:
   - The `draft` as a readable contract: objective, unit of work,
     acceptance criteria, budget, human baseline (each owner-declared; the
     result's `label` is `proposal-not-measured`, say so).
   - When the draft has `vendor_resolved_definition`, relay it with the
     `vendor_resolved_definition_label` beside it ("the vendor's definition, not
     verified"), never on its own.
   - `errors`: each one blocks publishing; say which field and why.
   - `warnings`: each one is a gap the person should know about (for
     example a missing baseline). Relay them; do not resolve them silently.
4. If the person wants to publish it, say that publishing uses the
   `metrx_set_job_contract` tool (the result's `publish` block names the path
   and scope), which needs a Metrxbot API key with the `admin` scope
   (Settings → Security), and that the contract's `owner` becomes the
   agent's owner on the review. Only call `metrx_set_job_contract` when they
   say so.

## Rules

- Every number in the contract is the person's own input and is labelled
  owner-declared. Do not present a template default as a measurement.
- The vendor's definition of resolved is the vendor's claim. Show it word for
  word and label it "the vendor's definition, not verified"; never present
  it as something Metrxbot checked, and never reword it.
- Do not promise what the contract will achieve. It is the yardstick, not
  the result.
