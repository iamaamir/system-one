---
name: system-one
description: "Use the system_one MCP tool for bounded choice, yes/no likelihood, and ordered score judgments over evidence already in state. Retrieve facts first; do not use it for browsing, recall, open-ended generation, or action approval."
---

# System One

Use the `system_one` tool for bounded judgments over evidence already supplied in `state`.

Use `choice` for unordered alternatives, `noul` for a yes/no likelihood, and `score` for an ordered rubric with at least two levels. Batch independent questions that share state. Retrieve missing facts first; System One does not browse or recall facts. Do not use it for open-ended generation, factual lookup, or permission to act.
