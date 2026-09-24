---
description: Judge a decision with calibrated probabilities via System One
argument-hint: "<decision and context>"
---
The user wants a calibrated judgment conditional on the supplied
state, not a prose opinion and not recalled facts. Retrieve any missing
factual evidence into the state first — then call the system_one tool
for the request below, do not answer it directly from priors.

Frame the request as one or more questions:

- exactly one option must be picked from several → a `choice`
  question, with criteria keyed by option label (`null` values when
  labels are self-explanatory),
- a yes/no must be estimated as a chance → a `noul` question (omit
  criteria unless the yes/no outcomes need clarification),
- something must be placed on an ordered scale → a `score` question
  with at least two ordered levels from lowest to highest.

Put the material under judgment in `state`. Batch all questions sharing
the same state into a single system_one call.

After the result, summarize per question: the pick, probability, or
score with its confidence (choice/score only — for noul the probability
itself is the uncertainty measure) — plus one line on what would change
the answer.

Request:
$@
