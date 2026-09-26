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
  the set grows, and the ceiling is 255 options). Returns winner +
  per-option probabilities + confidence.
  **A choice always returns a winner**: the probabilities sum to 1, so
  the closest irrelevant option still ranks first when nothing actually
  fits. So when "does this exist / does anything apply" is a real
  possibility, either add a `none`/`other` escape option, or ask that
  separately as a `noul` in the same call and read it first. Ranked
  alone, a choice cannot tell a real match from the nearest miss.
  Give the candidates `null` criteria values when the labels speak for
  themselves, but always *describe* the escape option.
- **score** — the answer is a position on an ordered scale (at least
  two levels, each described concretely, low to high). Returns a fractional score
  (probability-weighted mean — it can land between levels) + legend +
  probabilities + confidence. Use when you will threshold, sort, or
  average the result. A scale can carry the decision outright: give it
  a middle "let a person decide" level instead of fitting a threshold
  to your own data, and the level descriptions are writable before you
  have seen a single score.
- **noul** — the answer is yes or no. Returns one probability from 0 to
  1 and **no confidence field**: the probability already is the
  uncertainty measure (0.5 = maximally uncertain). Optional
  `true`/`false` criteria spell out what yes/no mean. Ideal for gates.

Yes/no with two named sides is a `noul`, not a two-option `choice`.

When several labels may apply at once, ask one `noul` per label rather
than one multi-answer `choice`: each answer is then an independent
P(yes) instead of a distribution that has to spend its mass.

## Letting code keep the work

The strongest recipes never ask the model to produce anything. They ask
it narrow questions about material that is already in `state`, and the
application assembles the result:

- **Pre-filter, then pick.** Find the candidate values in code first
  (a regex, a search index, a parsed list) and offer only those, so
  the option set is small and every option is something the model could
  legitimately choose. The model cannot pick a value you omitted, and it
  cannot invent or transpose one it was never shown.
- **Ask only what code cannot answer.** A quote missing from a document
  is decided by a substring match, not a round trip; blank lines and
  list markers are read in code. Spend judgments on the ambiguous part.
- **Select, don't generate.** To recover structure from flat text, ask
  whether each line break split a sentence and what kind of block each
  chunk is, then render in code — every character of the output then
  comes from the input, and every judgment carries a probability.
- **Re-rank, don't search twice.** Cheap recall narrows thousands of
  candidates to a shortlist; one judgment per shortlist entry orders it.
  Compare each candidate against the query, not against its neighbours.

## Batching and state hygiene

- Batch every independent question over the same state into **one**
  `system_one` call — one request reduces round-trips and lets the
  provider batch or parallelize evaluation where supported.
- `state` holds the content plus supporting facts, and nothing else.
  Judgments live in `questions`: text pasted into the state gets judged
  as content, so never put the question itself in the state.
- Trim the state to what the decision needs. You pay per input token,
  and accuracy falls as irrelevant detail grows. Name state fields
  rather than pasting prose, and point at them in `instructions` with a
  backticked path (`ticket.messages[0].text`) so the judgment is about
  the part you mean.
- Batching adds no run-to-run noise: the same questions answered
  one-per-call and all-in-one return the same answers to the same
  tolerance, so batching is a pure cost and latency win. It pays off
  most when the state is a large document every call would resend.
- `state` is where the material lives, so put both sides of a comparison
  in it (`entity_a`, `entity_b`) and phrase the questions about the
  pair, never about one side on its own.
- Question ids are yours (e.g. `route`, `urgency`); the model never sees
  them, so **the id is not a substitute for the question**. Write the
  complete meaning in `instructions` even when the id is self-explanatory —
  this is the single most common way a request goes wrong.

## Reading answers

- `confidence` (choice/score) is a spread statistic, not a feeling:
  concentrated mass = high, flat spread = low. Low confidence means
  ambiguous input, overlapping labels, or thin state — confirm or
  escalate, don't silently discard. Across a whole call, read it as the
  *least* certain judgment behind the answer: one wrong branch spoils
  the call even when the rest is certain.
- Gate per action cost: high-confidence acts automatically, middling
  confirms or flags, low goes to a human. Riskier actions get higher
  bars. For `noul`, threshold on distance from 0.5 (e.g. act above 0.9
  or below 0.1, review between). A battery of hazard `noul`s usually
  wants **two** thresholds each — at or above the action threshold it
  fires, and at or above a lower one it goes to review first — so the
  number is a policy constant in your code, not a word in a question.
- Check the answer's own order, too: highest confidence does not
  override a conflicting explicit decision. If you only want the best
  option, take the highest-confidence one instead of gating at all.
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
