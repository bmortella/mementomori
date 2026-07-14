# mementomori

A private, self-hosted ritual for keeping a 52-week journal. Each week of the year is one cell in a grid; you write once, seal it, and the entry is encrypted at rest and locked from view until December 31st. Weeks you miss simply stay empty — there's no backfilling, no editing after sealing, no pressure to catch up. On unlock day the year opens up for reading, and you can generate a single AI reflection over everything you sealed, looking back at the shape of the year as a whole.

## Quick start

Build and run with Docker:

```bash
docker build -t mementomori .
docker run -d -p 3000:3000 -v mm-data:/app/data -e TZ=America/Sao_Paulo mementomori
```

Then open [http://localhost:3000](http://localhost:3000). All state (the database, the encryption key, and your prompt pool) lives in the `mm-data` volume, so the container itself is disposable.

For local development instead:

```bash
npm install
npm run dev
```

## Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `TZ` | recommended | Timezone the ritual runs on — determines week boundaries and when the year unlocks (e.g. `America/Sao_Paulo`). Defaults to the container/host timezone if unset. |
| `DATA_DIR` | no | Where the database, key, and prompt pool are stored. Defaults to `./data`; in the Docker image this is `/app/data`, matching the `VOLUME`. |
| `MASTER_KEY` | no | 64 hex characters (32 bytes) used as the AES-256-GCM encryption key. If omitted, a key is generated on first run and stored as `master.key` in `DATA_DIR`. |
| `APP_PASSWORD` | no | If set, gates every route behind a login page (`/login`) until the correct password is submitted, via a signed cookie. If unset, the app is open — no gate. |
| `ANTHROPIC_API_KEY` | no | Overrides the Anthropic API key stored via `/settings` for the AI reflection feature. Useful for injecting a key at deploy time instead of pasting it into the UI. |

## Backups

Back up the entire data volume as a unit, not individual files. Two files in particular must travel together:

- `mementomori.db` — the SQLite database holding your sealed (encrypted) entries and settings.
- `master.key` — the encryption key (only present if you didn't set `MASTER_KEY` yourself).

Ciphertext without the key that encrypted it is unrecoverable by design — there is no recovery path, no backdoor, and no way to decrypt entries if `master.key` is lost or overwritten. If you set `MASTER_KEY` as an environment variable instead of letting the app generate a keyfile, make sure that value is backed up somewhere just as durable as the volume itself.

`prompts.json`, also in the data volume, holds the pool of writing prompts drawn from each week. It's a plain JSON file and safe to edit by hand between backups.

## Customizing

Most day-to-day settings live in the app itself, at `/settings`:

- **Anchor prompt** — the fixed prompt shown every week (as opposed to the rotating pool).
- **Unlock day** — the `MM-DD` on which the current year's entries become readable (defaults to December 31st; applies to newly started years).
- **Reflection provider** — the AI provider and model used to generate the end-of-year reflection, plus the API key (unless overridden by `ANTHROPIC_API_KEY`).

For deeper customization, edit `prompts.json` directly in the data volume to change the pool of prompts weeks are drawn from.
