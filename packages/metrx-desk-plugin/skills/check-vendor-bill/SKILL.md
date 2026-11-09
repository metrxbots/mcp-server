---
name: check-vendor-bill
description: Reconcile an AI vendor's per-resolution bill (for example a support bot billed per resolved ticket) against the company's own records, and report which billed units are supported, disputed, unmatched or outside coverage, with the disputed amount. Pure function, no key needed.
---

# Check a vendor bill

A per-resolution bill lists units the vendor says it resolved. The
company's own records (ticket events, resolved and rejected ids) say what
actually happened. This skill puts the two side by side.

## Steps

1. Collect:
   - `period`: `{ "from": ISO, "to": ISO }`, from before to.
   - `billed`: the bill lines, each `{ "external_id", "billed_at",
"cost_usd" }`, optionally `tier_name`, `adjustment_of` (a negative line that
     refers back to an earlier one), and `id`. Up to 500 lines per call.
   - At least one of: `resolved_ids` (ids your records show as resolved by
     the agent), `rejected_ids` (a person overturned it), or `ledger`
     (events `{ "external_id", "event_type", "occurred_at" }` where
     `event_type` is `solved`, `closed`, `reopened` or `public_comment`).
   - `covered_spans`: the time spans your records cover,
     `{ "from": ISO, "to": ISO | null }`. If the person cannot say, leave
     it out and tell them every unit will be reported as outside coverage.
   - Optional: `import_rejected_count`, the number of ledger rows that
     failed to import, so the report can say how much it could not see.
     If the person pastes a CSV, convert it faithfully; ask when a column is
     ambiguous rather than guessing which id is the vendor's.
2. Call `metrx_check_vendor_bill` with the input. No key is needed; the tool
   stores nothing.
3. Relay the result as a short reconciliation:
   - The `summary`: their count and `their_usd`, matched, disputed,
     unmatched, uncounted (rejected), outside coverage, and `disputed_usd`,
     `unmatched_usd`, `outside_coverage_usd`. `dropped_outside_period` says how many bill
     lines fell outside the period and were not judged. Relay the `note`.
   - Each class in one sentence: matched means your records show the
     resolution; disputed means your records show it reopened; uncounted
     means a person rejected it (overturned the resolution), so it is not
     counted either way; unmatched means your records have no trace of it;
     outside coverage means your records do not cover that time, so nothing
     can be said either way.
   - When `withheld` is true, say why: rejected lines are present, or the
     importer rejected `import_rejected` rows, so the records are known to
     be incomplete and no total difference is stated.
   - The disputed lines, each with its reason.
     Every amount is measured from the two inputs and is labelled
     `measured`. The result is a reconciliation, not a refund; say what the
     person can take to the vendor and leave the next step to them.
4. When `delta_usd` is null (always so while `withheld` is true) the tool
   could not form a total difference; say so and do not compute a
   substitute figure from the per-class amounts.

## Rules

- Never state a saving. The disputed amount is what the records contradict,
  nothing more.
- Do not fill `resolved_ids` from the bill itself; that would match every
  line to itself.
