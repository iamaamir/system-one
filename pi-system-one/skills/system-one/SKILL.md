---
name: system-one
description: "Judge bounded decisions over supplied state with System One models (Jev, Reflex, Von, Laya): choice, noul, and score questions returning calibrated state-conditional probabilities (confidence for choice/score only; noul has no confidence). Use when the request is a pick, yes/no likelihood, or scale score over material already in context — instead of answering from priors. The judge cannot recall facts; retrieve evidence first. Backends speak POST /v1/systemone."
---

# System One decisions

System One models (TypeSafe's Jev, Reflex, Von, Laya — all speak
`POST /v1/systemone`) are judge models, not chat models. They take a
`state` plus typed questions and return one calibrated answer per
question: a pick, a probability, or a position on a scale. No prose to
parse, no hallucinated formats — the answer shape is fixed by the
request. Call them through your
agent's System One tool (exposed as `system_one` in Pi), never by
hand-rolling HTTP.

## When to call

If the request resolves to one of these over material already in
context, judge it with the System One tool instead of answering from
priors — in any domain, any phrasing:

- exactly one option must be picked from several → `choice`
- a yes/no must be estimated as a chance → `noul`
- something must be placed on an ordered scale → `score`

Retrieve evidence first, then judge with the evidence as state — never
ask the judge to recall facts. System One turns evidence into a bounded
decision; it is not a substitute for factual lookup or open-ended
reasoning.

One user message can hold several such judgments; batch them over the
same state in a single call.

## Which question type

Decide by the shape of the answer, not the difficulty of the judgment:

- **choice** — the answer is one item from a list (at least one
  labelled option; keep sets small enough to judge — accuracy falls as
  the set grows). Returns winner + per-option probabilities +
  confidence. Add an `other` option when the set might not cover the
  input, and use `null` criteria values for self-explanatory labels.
- **score** — the answer is a position on an ordered scale (at least
  two levels, each described concretely, low to high). Returns a fractional score
  (probability-weighted mean — it can land between levels) + legend +
  probabilities + confidence. Use when you will threshold, sort, or
  average the result.
- **noul** — the answer is yes or no. Returns one probability from 0 to
  1 and **no confidence field**: the probability already is the
  uncertainty measure (0.5 = maximally uncertain). Optional
  `true`/`false` criteria spell out what yes/no mean. Ideal for gates.

Yes/no with two named sides is a `noul`, not a two-option `choice`.

## Batching and state hygiene

- Batch every independent question over the same state into **one**
  `system_one` call — one request reduces round-trips and lets the
  provider batch or parallelize evaluation where supported.
- `state` holds the content plus supporting facts, and nothing else.
  Judgments live in `questions`: text pasted into the state gets judged
  as content, so never put the question itself in the state.
- Trim the state to what the decision needs. You pay per input token,
  and accuracy falls as irrelevant detail grows.
- Question ids are yours (e.g. `route`, `urgency`); the model never sees
  them, so name them for your own branching.

## Reading answers

- `confidence` (choice/score) is a spread statistic, not a feeling:
  concentrated mass = high, flat spread = low. Low confidence means
  ambiguous input, overlapping labels, or thin state — confirm or
  escalate, don't silently discard.
- Gate per action cost: high-confidence acts automatically, middling
  confirms or flags, low goes to a human. Riskier actions get higher
  bars. For `noul`, threshold on distance from 0.5 (e.g. act above 0.9
  or below 0.1, review between).
- Start thresholds conservative, log decisions with their confidence,
  and move the numbers once you see where wrong answers cluster. Pin
  the backend model version once a threshold is tuned (`jev-latest`
  moves between releases and numbers can shift under you).

## Use-case catalog

See [use cases](references/use-cases.md) for copy-pasteable recipes:
ticket triage, confidence-gated actions, guardrails (prompt injection,
fraud, compliance), content scoring, intent/tool routing, labelling at
scale, agent self-judgment (ship/revert, regression risk, coverage),
and composition patterns (cascading to a bigger model, composite
scoring, retrieval before judgment).
