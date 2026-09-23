# pi-system-one

System One decisions for Pi. Plug in TypeSafe Jev, Reflex, or your own provider.

```bash
pi install npm:pi-system-one
```

**Configuration**

###### typesafe/jev
```bash
export SYSTEM_ONE_BASE_URL=https://api.typesafe.ai
export SYSTEM_ONE_API_KEY=<your‑real‑api‑key>
export SYSTEM_ONE_MODEL=jev-latest
```

or 

###### locally running model
```bash
export SYSTEM_ONE_BASE_URL=http://localhost:8009
```

The extension provides a `/so` command for configuring the System One client:

- `SYSTEM_ONE_BASE_URL` – required endpoint URL.
- `SYSTEM_ONE_MODEL` – optional default model name.
- `SYSTEM_ONE_API_KEY` – optional API key.

When you run `/so config`, you can:

- **Enter a new API key** – it is stored in memory only and will be lost when the session ends.
- **Enter `-`** – forget the memory‑only key. If `SYSTEM_ONE_API_KEY` environment variable is present, the client will fall back to it; otherwise the key becomes absent.
- **Leave the input empty** – keep the existing value.

The current configuration can be inspected with `/so status`.

---
