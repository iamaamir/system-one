# Benchmarks

Lightweight, dependency-free micro-benchmarks for the perf PR. They import
`src/` directly and run on the existing toolchain:

```sh
node --expose-gc --experimental-strip-types bench/normalize.bench.ts
node --expose-gc --experimental-strip-types bench/http-memory.bench.ts
node --experimental-strip-types bench/render.bench.ts
```

(`--expose-gc` is required for the heap/garbage figures.)

## What each script measures

- `normalize.bench.ts` — `prepareSystemOneArgs()` throughput + garbage per op
  for canonical / sloppy / mixed requests, plus the defensive second pass
  over already-normalized output.
- `http-memory.bench.ts` — `HttpSystemOneProvider` bounded-memory behavior:
  small + near-limit + over-limit success bodies, small + near-limit 4xx
  bodies, provider construction cost. Uses a 10KB cap so it stays fast.
- `render.bench.ts` — `renderSystemOneResult()` output sizes and the compact
  candidate from the brief (evaluation only; rendering is unchanged).
- `validation.bench.ts` — `validateResponse()` on the real production path
  for choice/score at sizes 3/10/50/255 plus a mixed batch. Run against this
  tree and against the v1.2.0 baseline tree with the same file to compare
  validation strategies.

## Interpreting numbers

- Timing (`ops/sec`, `ns/op`) is the stable primary metric. Re-run 2–3x;
  expect a few % jitter.
- `garbage ~NB/op` is median-of-7 heap growth with no GC mid-round: an
  order-of-magnitude comparative figure, not an exact allocation count.
  The same harness runs before/after, so deltas are meaningful even though
  absolutes include harness overhead (fake Responses, streams).
- `retained ~0B` after a full gc means no leak; anything consistently large
  here would be a real problem.
- `results-baseline-v1.2.0.md` is the recorded v1.2.0 baseline. The
  "after" numbers live in the PR's final report.
