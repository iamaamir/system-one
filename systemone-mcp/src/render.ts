type Answer = Record<string, unknown>;

function line(
  key: string,
  value: unknown,
  legend?: Record<string, unknown>,
): string {
  const label =
    /^\d+$/.test(key) && typeof legend?.[key] === "string"
      ? ` ${legend[key]}`
      : "";
  return `    ${key}${label}: ${String(value)}`;
}

export function renderSystemOneResult(response: {
  answers: Record<string, Answer>;
}): string {
  const lines = ["System One result", ""];
  for (const [id, answer] of Object.entries(response.answers)) {
    if (answer.type === "choice") {
      lines.push(
        `${id}:`,
        `  choice: ${String(answer.choice)}`,
        `  confidence: ${String(answer.confidence)}`,
        "  probabilities:",
      );
      for (const [key, value] of Object.entries(
        (answer.probabilities as Record<string, unknown>) ?? {},
      ))
        lines.push(line(key, value));
    } else if (answer.type === "noul") {
      lines.push(`${id}:`, `  noul: ${String(answer.noul)} (P(yes))`);
    } else if (answer.type === "score") {
      lines.push(
        `${id}:`,
        `  score: ${String(answer.score)}`,
        `  confidence: ${String(answer.confidence)}`,
        "  probabilities:",
      );
      for (const [key, value] of Object.entries(
        (answer.probabilities as Record<string, unknown>) ?? {},
      ))
        lines.push(
          line(
            key,
            value,
            answer.legend as Record<string, unknown> | undefined,
          ),
        );
    } else
      lines.push(
        `${id}:`,
        `  unknown answer type: ${String(answer.type ?? "missing")}`,
      );
    lines.push("");
  }
  lines.push(
    "noul is P(yes). A choice always returns a winner, including when every option is a poor fit; treat it as the closest fit. Confidence is not permission to act.",
  );
  return lines.join("\n");
}
