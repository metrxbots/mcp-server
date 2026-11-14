---
name: cost-per-resolution
description: The two numbers on a per-resolution AI bill (for example Intercom Fin, Zendesk AI, Sierra or Decagon), computed from the bill total and the billed resolution count, with the vendor's own definition of resolved echoed back. Both numbers are the vendor's own count, labelled vendor-reported and not Verified. Pure function, no key needed. Use it as the first call, before check-vendor-bill.
---

# Cost per resolution: the two numbers

A per-resolution bill rests on two figures the vendor supplies: what it billed
and how many resolutions it counted. This skill turns them into the effective
price per billed resolution and, when the total conversations is known, the
share of conversations the vendor billed as resolved. It is the first call:
one question, with nothing to export.

## Steps

1. Collect from the person:
   - `bill_total`: the bill total for the period, a plain number (no symbol).
   - `billed_resolutions`: how many resolutions the vendor billed.
   - `period`: `{ "from", "to" }`, dates such as `2026-10-01` and
     `2026-10-31`, from on or before to.
   - Optional: `currency` (a three-letter code, USD when omitted), `vendor`
     (the name), `vendor_resolved_definition` (the vendor's own wording for
     what counts as resolved, pasted as written) and `total_conversations`
     (all conversations the agent handled in the period).
   - Do not estimate a missing figure. If the person does not have
     `total_conversations`, leave it out and say the share will not be stated.
2. Call `metrx_cost_per_resolution` with the input. No key is needed; the tool
   stores nothing. A refusal names each field that is wrong (a negative or
   non-numeric figure is refused, not corrected); relay it and ask for the
   figure again.
3. Relay the result in this order:
   - `effective_price_per_resolution` with its `currency`. When it is null the
     vendor billed no resolutions, so say there is no price to state.
   - `billed_resolution_share_pct`, only when `total_conversations` was given.
     When `warnings` is not empty (for example billed resolutions above
     conversations), say so before the number.
   - The vendor's definition exactly as `vendor_definition.text` has it, with
     the status the tool returns: the vendor's definition, not verified. If no
     definition was given, say that the person has not supplied one and that
     it is worth asking the vendor for it in writing.
   - The `provenance` statement: both numbers are the vendor's own count,
     vendor-reported, not Verified. Do not call them measured or confirmed.
4. End with the `next_step`, every time, as the tool words it: send one
   export, the bill lines with ticket ids plus your ticket export for the same
   period, and Metrx recounts it. That recount is `metrx_check_vendor_bill`;
   offer the `check-vendor-bill` skill and say what it needs (the bill lines
   with ticket ids and the ticket records for the same period).

## Rules

- Never state a saving, a dispute or a difference. These two numbers come from
  the vendor's count and show nothing about whether that count is right.
- Do not rephrase the vendor's definition or judge it. Quote it.
- Do not compare the price with another vendor or a benchmark; there is no
  source for either here.
