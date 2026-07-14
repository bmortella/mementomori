# memento mori

> "It is not that we have a short time to live, but that we waste a lot of it." — Seneca

A private, self-hosted ritual for keeping a 52-week journal, built on the Stoic life calendar: a year of your life as 52 boxes, each one filled exactly once and then gone for good. You write one paragraph a week, seal it, and the entry is encrypted at rest and locked from view until the year's unlock day. Weeks you miss simply stay empty — there's no backfilling, no editing after sealing, no pressure to catch up.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/writing-dark.png">
  <img src="docs/screenshots/writing-light.png" alt="The writing view: a 52-week grid with sealed, missed, and future weeks, above the weekly prompt and writing surface." width="830">
</picture>

## The ritual

- **One paragraph a week.** A fixed anchor prompt — *"One of your weeks is gone for good. What did you do with it?"* — and an optional drawn prompt from a customizable pool when you're circling: achievements, lessons learned, time that could have been spent more wisely.
- **Sealed means sealed.** Entries are encrypted with AES-256-GCM the moment you seal them. There is no way to read them back through the app until the year unlocks — not even for you.
- **Missed weeks are part of the record.** They stay in the grid as gaps, deliberately.
- **On unlock day** (December 31st by default) the year opens: every entry becomes readable, and an AI reads the whole year back to you as a single reflection — recurring themes, contradictions, what changed, and what the gaps might mean.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/readback-dark.png">
  <img src="docs/screenshots/readback-light.png" alt="The end of an unlocked year: the December entries, followed by the AI-written reflection on the whole year." width="830">
</picture>

The reflection works with the Anthropic API or a local [Ollama](https://ollama.com) model, so the year never has to leave your machine. Unlocked years move to a quiet archive:

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/archive-dark.png">
  <img src="docs/screenshots/archive-light.png" alt="The past-years archive, listing each unlocked year with how many of its 52 weeks were sealed." width="830">
</picture>

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
- **Unlock day** — the `MM-DD` on which entries become readable (defaults to December 31st; changing it also applies to years still sealed).
- **Reflection provider** — Anthropic or Ollama, the model, and the API key (unless overridden by `ANTHROPIC_API_KEY`). Keys are encrypted at rest.
- **Seal confirmation** — off by default; enable it if you want a "sure?" step before a week is sealed forever.

For deeper customization, edit `prompts.json` directly in the data volume to change the pool of prompts weeks are drawn from.

## Tech

Next.js (App Router), SQLite via better-sqlite3 + Drizzle, Tailwind CSS, Vitest. One container, one volume, no external services required.
