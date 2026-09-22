# system-one-core

Provider-neutral System One runtime for TypeScript. Plug in TypeSafe Jev, Reflex, or your own provider.

```ts
import { SystemOne, HttpSystemOneProvider, choice, noul } from "system-one-core";

const systemOne = new SystemOne({
  provider: new HttpSystemOneProvider({ baseUrl: "http://localhost:8008" }),
});

const result = await systemOne.evaluate({
  state: "The export button crashes in Safari.",
  questions: {
    team: choice("Which team should investigate?", { frontend: null, backend: null }),
    browser: noul("Is this bug browser specific?"),
  },
});
```

See `dist/index.d.ts` for the full public API (`SystemOne`, `SystemOneProvider`, `HttpSystemOneProvider`, `MockSystemOneProvider`, `choice`, `noul`, `score`, errors).
