# pi-system-one

System One decisions for Pi. Plug in TypeSafe Jev, Reflex, or your own provider.

```bash
pi install npm:pi-system-one
export SYSTEM_ONE_BASE_URL=http://localhost:8008
```

**Configuration**

The extension provides a `/so` command for configuring the System One client:

- `SYSTEM_ONE_BASE_URL` – required endpoint URL.
- `SYSTEM_ONE_MODEL` – optional default model name.
- `SYSTEM_ONE_API_KEY` – optional API key.

When you run `/so config`, you can:

- **Enter a new API key** – it is stored in memory only and will be lost when the session ends.
- **Enter `-`** – forget the memory‑only key. If an `SYSTEM_ONE_API_KEY` environment variable is present, the client will fall back to it; otherwise the key becomes absent.
- **Leave the input empty** – keep the existing value.

The current configuration can be inspected with `/so status`.

---

For further details see the source code and comments in `src/commands.ts`.
```