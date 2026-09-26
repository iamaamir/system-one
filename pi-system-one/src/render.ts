// biome-ignore-all lint/suspicious/noExplicitAny: intentional dynamic boundary over JSON protocol values
// pi-system-one/src/render.ts

/*
 * This is the only System One text the agent reads at call time. The skill
 * explains how to read answers, but the skill loads on demand and may not be
 * loaded at all, so anything needed to interpret a number has to appear here.
 *
 * The score answer is why that matters. The contract lets a score distribute
 * over either index slots ("0".."n-1") or the level values themselves, and
 * requires a legend labelling exactly the distributed keys (enforced in
 * system-one-core validation). On the index-slot convention a bare
 * `probabilities: 0: 0.57` names no level at all, so the legend is rendered
 * inline next to its key rather than dropped.
 */

/** Is this probability key an index slot rather than a self-describing label? */
function isSlotKey(key: string): boolean {
  return /^\d+$/.test(key);
}

function renderProbabilityLine(
  key: string,
  value: unknown,
  legend: Record<string, unknown> | undefined,
): string {
  // Only index slots need help identifying themselves; a key that is already
  // the level text labels itself, and repeating it would just cost tokens.
  const label = isSlotKey(key) ? legend?.[key] : undefined;
  const described =
    typeof label === "string" && label.trim() !== "" && label !== key
      ? `${key} ${label}`
      : key;
  return `    ${described}: ${String(value)}`;
}

function scoreScaleNote(
  score: unknown,
  probabilities: unknown,
): string | undefined {
  if (typeof score !== "number" || !Number.isFinite(score)) return undefined;
  if (!probabilities || typeof probabilities !== "object") return undefined;
  const count = Object.keys(probabilities as object).length;
  if (count < 2) return undefined;
  // The score is a position on the rubric, not a level index and not a
  // percentage: it can land between levels. Say so, and give the range.
  return `  (position on the 0..${count - 1} rubric scale; it can land between levels)`;
}

export function renderSystemOneResult(response: {
  answers: Record<string, any>;
}): string {
  const lines = ["System One result", ""];
  for (const [id, a] of Object.entries(response.answers)) {
    if (a?.type === "choice") {
      lines.push(
        `${id}:`,
        `  choice: ${a.choice}`,
        `  confidence: ${a.confidence}`,
        `  probabilities:`,
      );
      for (const [k, v] of Object.entries(a.probabilities ?? {}))
        lines.push(renderProbabilityLine(k, v, undefined));
    } else if (a?.type === "noul") {
      lines.push(`${id}:`, `  noul: ${a.noul}`);
    } else if (a?.type === "score") {
      lines.push(
        `${id}:`,
        `  score: ${a.score}`,
        `  confidence: ${a.confidence}`,
      );
      const note = scoreScaleNote(a.score, a.probabilities);
      if (note) lines.push(note);
      if (a.probabilities && typeof a.probabilities === "object") {
        lines.push(`  probabilities:`);
        for (const [k, v] of Object.entries(a.probabilities))
          lines.push(renderProbabilityLine(k, v, a.legend));
      }
    } else {
      lines.push(`${id}:`, `  unknown answer type: ${a?.type ?? "missing"}`);
    }
    lines.push("");
  }
  // One line, once, instead of a paragraph per answer: the three things an
  // agent cannot infer from the numbers alone.
  lines.push(
    "noul is P(yes). A choice always returns a winner, so treat it as the best fit rather than proof one applies. confidence reflects the least certain judgment behind an answer and is not permission to act.",
  );
  return lines.join("\n").trimEnd();
}
