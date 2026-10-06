import type { Theme } from "@earendil-works/pi-coding-agent";
import {
  matchesKey,
  truncateToWidth,
  visibleWidth,
} from "@earendil-works/pi-tui";
import type { DebugEntry } from "./debug.ts";

function counts(entry: DebugEntry): string {
  const { choice, noul, score } = entry.questions;
  return `${choice} choice · ${noul} noul · ${score} score`;
}

function rowCounts(entry: DebugEntry): string {
  const { choice, noul, score } = entry.questions;
  return [
    choice ? `${choice} choice` : "",
    noul ? `${noul} noul` : "",
    score ? `${score} score` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

/** Only render fields assembled by DebugHistory, never tool input or raw provider text. */
export function debugSummary(entries: readonly DebugEntry[]): string {
  const last = entries[0];
  if (!last) return "System One debug: No system_one calls yet.";
  return `System One debug: ${last.provider} · ${last.outcome} · ${last.durationMs ?? "running"} ms · ${counts(last)}. Session-only; ${entries.length} call(s) recorded.`;
}

export class DebugOverlay {
  private selected = 0;
  private readonly entries: readonly DebugEntry[];
  private readonly theme: Theme;
  private readonly done: () => void;
  private readonly requestRender: () => void;
  constructor(
    entries: readonly DebugEntry[],
    theme: Theme,
    done: () => void,
    requestRender: () => void,
  ) {
    this.entries = entries;
    this.theme = theme;
    this.done = done;
    this.requestRender = requestRender;
  }

  handleInput(data: string): void {
    if (
      matchesKey(data, "escape") ||
      matchesKey(data, "q") ||
      matchesKey(data, "ctrl+c")
    )
      this.done();
    else if (matchesKey(data, "up") || matchesKey(data, "k")) {
      this.selected = Math.max(0, this.selected - 1);
      this.requestRender();
    } else if (matchesKey(data, "down") || matchesKey(data, "j")) {
      this.selected = Math.min(
        Math.max(0, this.entries.length - 1),
        this.selected + 1,
      );
      this.requestRender();
    }
  }

  render(width: number): string[] {
    if (width < 3) return [" ".repeat(Math.max(0, width))];
    const inner = width - 2;
    const th = this.theme;
    const page = Math.floor(this.selected / 7) * 7;
    const pageEnd = Math.min(page + 7, this.entries.length);
    const lines = [
      th.fg("accent", " System One · Debug"),
      th.fg(
        "text",
        this.entries.length
          ? ` ${page + 1}-${pageEnd} of ${this.entries.length} recent calls · selected #${this.selected + 1} · session-only`
          : " Session-only · no request content saved",
      ),
      "",
    ];
    if (this.entries.length === 0) lines.push(" No system_one calls yet.");
    else {
      for (let index = page; index < pageEnd; index++) {
        const entry = this.entries[index];
        const row = `${index === this.selected ? ">" : " "} #${index + 1} ${entry.startedAt.slice(11, 19)}  ${entry.provider.padEnd(10)} ${entry.outcome.padEnd(7)} ${rowCounts(entry)}`;
        lines.push(index === this.selected ? th.fg("accent", row) : row);
      }
      const entry = this.entries[this.selected];
      lines.push(
        "",
        th.fg("accent", " Selected call"),
        ` Mode: ${entry.mode}  ·  Provider: ${entry.provider}`,
        ` Route: ${entry.reason}`,
        ...(entry.requestTarget ? [` Target: ${entry.requestTarget}`] : []),
        ` Questions: ${counts(entry)}`,
        ` Outcome: ${entry.outcome}  ·  Duration: ${entry.durationMs ?? "running"} ms`,
        ` Dispatch: ${entry.attempted ? "attempted (delivery not verified)" : "not attempted"}`,
        ...(entry.failure
          ? [
              ` Failure: ${entry.failure}${entry.httpStatus ? ` (HTTP ${entry.httpStatus})` : ""}`,
            ]
          : []),
      );
    }
    lines.push("", th.fg("text", " ↑/↓ browse · q/Esc close"));
    const output = [th.fg("border", `╭${"─".repeat(inner)}╮`)];
    for (const line of lines) {
      const clipped = truncateToWidth(line, inner, "…", true);
      output.push(
        th.fg("border", "│") +
          clipped +
          " ".repeat(Math.max(0, inner - visibleWidth(clipped))) +
          th.fg("border", "│"),
      );
    }
    output.push(th.fg("border", `╰${"─".repeat(inner)}╯`));
    return output;
  }

  invalidate(): void {}
}
