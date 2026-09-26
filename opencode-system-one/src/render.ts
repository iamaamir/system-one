import type { SystemOneResponse } from "system-one-core";

function renderDistribution(
  values: Record<string, number> | undefined,
): string[] {
  return Object.entries(values ?? {}).map(
    ([key, value]) => `    ${key}: ${value}`,
  );
}

function renderLegend(
  probabilities: Record<string, number> | undefined,
  legend: Record<string, unknown>,
): string[] {
  return Object.keys(probabilities ?? {}).map(
    (key) => `    ${key}: ${JSON.stringify(legend[key])}`,
  );
}

export function renderSystemOneResult(response: SystemOneResponse): string {
  const lines = ["System One result", ""];

  for (const [name, answer] of Object.entries(response.answers)) {
    lines.push(`${name}:`);
    if (answer.type === "choice") {
      lines.push(
        `  choice: ${answer.choice}`,
        `  confidence: ${answer.confidence}`,
        "  probabilities:",
        ...renderDistribution(answer.probabilities),
      );
    } else if (answer.type === "noul") {
      lines.push(`  noul: ${answer.noul}`);
    } else {
      lines.push(
        `  score: ${answer.score}`,
        `  confidence: ${answer.confidence}`,
        "  probabilities:",
        ...renderDistribution(answer.probabilities),
        "  legend:",
        ...renderLegend(answer.probabilities, answer.legend),
      );
    }
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}
