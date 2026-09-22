import { describe, it } from "node:test";
import { HttpSystemOneProvider } from "../src/providers/http.ts";
import { SystemOne } from "../src/client.ts";
import { choice, noul, score } from "../src/questions.ts";
const cases = [
  ["reflex", process.env.SYSTEM_ONE_TEST_REFLEX === "1", process.env.SYSTEM_ONE_REFLEX_URL ?? "http://localhost:8008", undefined, undefined],
  ["typesafe", process.env.SYSTEM_ONE_TEST_TYPESAFE === "1", "https://api.typesafe.ai", process.env.TYPESAFE_API_KEY, "jev-latest"],
] as const;

for (const [name, enabled, baseUrl, apiKey, model] of cases) {
  describe(`contract:${name}`, { skip: !enabled }, () => {
    it("answers mixed batch with valid protocol", async () => {
      const s1 = new SystemOne({ provider: new HttpSystemOneProvider({ id: name, baseUrl, apiKey }) });
      const res = await s1.evaluate({
        state: "The export button crashes in Safari.",
        ...(model ? { model } : {}),
        questions: {
          team: choice("Which team?", { frontend: null, backend: null }),
          browser: noul("Is this browser specific?"),
          level: score("How hard?", ["easy", "hard"] as const),
        },
      });
      if ((res.answers.team as any).type !== "choice") throw new Error("bad team");
      if ((res.answers.browser as any).type !== "noul") throw new Error("bad browser");
      if ((res.answers.level as any).type !== "score") throw new Error("bad level");
    });
  });
}
