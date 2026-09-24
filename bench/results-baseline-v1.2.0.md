# v1.2.0 baseline (recorded before any implementation change)

Machine: node v24.14.0 arm64 (Apple Silicon). Each figure is one run;
timing jitter of a few % across runs is normal.

## normalize.bench.ts — prepareSystemOneArgs() + JSON.stringify

The result is stringified to defeat V8 escape analysis (discarded results
understate real allocation; the provider stringifies downstream anyway).

```text
canonical  50,000 iters | 1,068,000 ops/sec | ~935ns/op | garbage ~355B/op
sloppy     50,000 iters |   725,000 ops/sec | ~1380ns/op | garbage ~889B/op
mixed      50,000 iters |   388,000 ops/sec | ~2580ns/op | garbage ~882B/op
canonical2 (second pass on normalized output) | same as canonical (~936ns, ~360B/op)
```

Notes:

- Timing stable to ±1% across runs; garbage medians repeat exactly.
  `retained` ~0B everywhere (no leaks).
- A global 20k/shape warmup precedes measurement so cold-JIT effects
  don't penalize whichever scenario runs first.
- The second pass currently costs the same as the first — the CoW target
  is to make it near-free with identical output.

## http-memory.bench.ts — HttpSystemOneProvider (10KB cap)

```text
small ok (300B)              ~150,000 ops/sec | ~6600ns/op | garbage ~5250B/op
near-limit ok (~10KB, 20x500B chunks) ~39,000 ops/sec | ~25600ns/op | garbage ~19-20KB/op
over-limit ok (100KB stream, 10KB cap) throws "response too large" | garbage ~9-11KB/op
small 4xx                    throws "provider error 422: bad question"
near-limit 4xx (20KB body)   detail total 520 chars (2KB error cap + 500-char detail cap + prefix)
provider construction        ~26,000,000 ops/sec | ~38ns/op
```

Notes:

- Over-limit garbage (~9-11KB for a 100KB stream, including the harness's
  own fake-Response/stream machinery) proves the stream is cut mid-read
  rather than fully buffered. One early run showed ~47KB (background-GC
  noise); repeated runs settle at ~9-11KB. `retained` ~0B after gc.
- Near-limit garbage is ~2x body size: one copy in chunk list, one merged
  copy, plus the decoded string. Removing the merged copy is the Phase 8
  target.
- Current behavior to preserve: exact error strings above, timeout/abort
  classification, byte-based success limit on the streamed path.

## render.bench.ts — renderSystemOneResult()

```text
choice/3                 current 132 chars  | compact 97 chars  (27% smaller)
choice/50                current 1898 chars | compact 1722 chars (9% smaller)
choice/255               current 9892 chars | compact 9101 chars (8% smaller)
score/5                  current 159 chars  | compact 118 chars (26% smaller)
multi(choice+noul+score) current 365 chars  | compact 303 chars (17% smaller)
```

Render throughput: 465ns (choice/3) … 11.9µs (choice/255) per call.

Evaluation: the compact candidate saves 8–27%, dominated by probability
payload that must be preserved either way. The output is model-visible
text, so changing its format is a behavior change beyond this PR's
"implementation, not behavior" rule; left unchanged, reported as a
follow-up.
