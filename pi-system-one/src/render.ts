// biome-ignore-all lint/suspicious/noExplicitAny: intentional dynamic boundary over JSON protocol values
// pi-system-one/src/render.ts
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
        lines.push(`    ${k}: ${v}`);
    } else if (a?.type === "noul") {
      lines.push(`${id}:`, `  noul: ${a.noul}`);
    } else {
      lines.push(
        `${id}:`,
        `  score: ${a.score}`,
        `  confidence: ${a.confidence}`,
      );
    }
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}
