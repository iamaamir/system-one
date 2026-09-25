import type { SystemOneResponse } from "system-one-core";

function renderDistribution(
  values: Record<string, number> | undefined,
): string[] {
  return Object.entries(values ?? {}).map(
    ([key, value]) => `    ${key}: ${value}`,
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
      );
    }
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}
