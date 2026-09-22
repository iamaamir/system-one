// Replays stored fixture requests against live backends and validates responses.
// Does NOT overwrite goldens. Usage:
//   TYPESAFE_API_KEY=... npm run fixtures:revalidate
//   SYSTEM_ONE_REFLEX_URL=http://localhost:8009 npm run fixtures:revalidate -- --reflex-only
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SystemOne } from "../src/client.ts";
import { HttpSystemOneProvider } from "../src/providers/http.ts";
import type { QuestionMap } from "../src/questions.ts";

interface StoredFixture {
  request: { state: string; questions: QuestionMap };
}

const dir = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "tests",
  "fixtures",
);
const reflexOnly = process.argv.includes("--reflex-only");
const failures: string[] = [];

async function check(
  name: string,
  provider: HttpSystemOneProvider,
  request: {
    state: string;
    questions: QuestionMap;
    model?: string;
  },
): Promise<void> {
  const s1 = new SystemOne({ provider });
  try {
    await s1.evaluate(request);
    console.log(`ok   ${name}`);
  } catch (e) {
    const msg = (e as Error).message;
    if (provider.id === "reflex" && /ECONNREFUSED|fetch failed/i.test(msg)) {
      console.log(
        `skip ${name} (no Reflex server; start one or set SYSTEM_ONE_REFLEX_URL)`,
      );
      return;
    }
    failures.push(name);
    console.log(`FAIL ${name}: ${msg}`);
  }
}

const typesafe = new HttpSystemOneProvider({
  id: "typesafe",
  baseUrl: "https://api.typesafe.ai",
  apiKey: process.env.TYPESAFE_API_KEY,
});
const reflex = new HttpSystemOneProvider({
  id: "reflex",
  baseUrl: process.env.SYSTEM_ONE_REFLEX_URL ?? "http://localhost:8008",
});

for (const f of readdirSync(dir)
  .filter((x) => x.endsWith(".json") && !x.startsWith("."))
  .sort()) {
  const fx = JSON.parse(readFileSync(join(dir, f), "utf8")) as StoredFixture;
  if (f.startsWith("typesafe-") && !reflexOnly) {
    if (!process.env.TYPESAFE_API_KEY) {
      console.log(`skip ${f} (no TYPESAFE_API_KEY)`);
      continue;
    }
    await check(f, typesafe, {
      state: fx.request.state,
      questions: fx.request.questions,
      model: "jev-latest",
    });
  } else if (f.startsWith("reflex-")) {
    await check(f, reflex, {
      state: fx.request.state,
      questions: fx.request.questions,
    });
  } else {
    console.log(`skip ${f} (unknown filename prefix)`);
  }
}
if (failures.length > 0) {
  console.error(`\n${failures.length} fixture(s) failed live revalidation`);
  process.exit(1);
}
console.log("\nall fixtures revalidate live");
