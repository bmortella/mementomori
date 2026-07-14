# Memento Mori — Design

A self-hosted, single-user stoic ritual app. Each week you write one short reflection and seal it into one cell of a 52-cell grid representing the calendar year. Sealed entries are encrypted and unreadable — no peeking, no editing — until the unlock date (default December 31), when the whole grid opens at once and an AI writes a reflection on the year's patterns. Unlocked years move to a permanent archive; a new grid begins each January 1.

## Core rules

- **Seal on submit.** Writing and sealing are one act. No server-side drafts, no edits, no deletes.
- **One paragraph, tops.** An entry is a distillation, not a journal: a single paragraph, hard-capped at 750 characters, no line breaks. Enforced in the UI and by the server.
- **Missed weeks stay empty forever.** The server only accepts a seal for the current week (by its own clock). The gap is part of the record.
- **Sealed means unreadable.** Entries are encrypted at rest the moment they're sealed and only decrypted server-side after the year's status is `unlocked`. Before unlock, the API exposes metadata only (week dates, sealed-at time).
- **Calendar-year grids.** Starting mid-year leaves earlier cells permanently empty, consistent with the missed-week rule. Every year unlocks on the same natural date.

## Architecture

- **Stack:** Next.js (App Router) + TypeScript, SQLite via Drizzle ORM + better-sqlite3.
- **Deployment:** single Docker container (Next standalone output). One data volume holds the SQLite file, the keyfile, and the editable prompt pool. Backup = copy the volume.
- **Auth:** no accounts. Optional `APP_PASSWORD` env var enables a simple cookie gate; otherwise the app is expected to run behind a VPN/reverse proxy (e.g., Tailscale).
- **Timezone:** the server's `TZ` env var defines the ritual's timezone — week boundaries and unlock dates are computed from it. Client clocks are never trusted.

### Week definition

Every year has exactly 52 cells. Week *n* (1–52) covers days `Jan 1 + 7·(n−1)` through the following 7 days; week 52 absorbs the year's final extra days (Dec 31, or Dec 30–31 in leap years). Each cell maps to fixed dates; no ISO week-53 handling.

### Data model

Three tables:

- **`years`** — `year` (PK), `unlock_date` (default Dec 31 of that year), `status` (`active` | `unlocked`), `reflection_text`, `reflection_status` (`none` | `pending` | `running` | `done` | `failed`), `reflection_error`.
- **`entries`** — `year` + `week_number` (unique together), `sealed_at`, `content_ciphertext`, `nonce`, `prompt_id` (nullable — the last drawn pool prompt, if any).
- **`settings`** — key/value: anchor prompt text, unlock-date override, LLM provider config (provider, model, API key / host).

### Encryption

AES-256-GCM with a server-held key: `MASTER_KEY` env var, or a keyfile auto-generated on first run in the data volume. Entries are encrypted at seal time; plaintext is never written to disk. A stored canary value is decrypted at startup to catch a missing, swapped, or corrupted key before any sealing happens — on failure the app refuses to start. This is friction against casual peeking, not a cryptographic time-lock: the key lives on the same machine.

### Prompt pool

A small, carefully curated JSON file (~30 stoic prompts, themes from Marcus Aurelius, Seneca, Epictetus) shipped into the data volume and editable there. "Draw a prompt" picks randomly from prompts not yet drawn that year; in the unlikely case the pool is exhausted mid-year, it resets and reuse is allowed.

## The ritual flow

### Main view — the year grid

One screen: the 52-cell grid on top, the writing surface below it (layout details in the UI design section). Sealed weeks are solid, missed weeks struck through, the current week ringed, future weeks faint. Interacting with a sealed cell shows only its week dates and sealed-at time — never content.

### Writing

The writing surface sits directly below the grid, always open for the current week:

- The **anchor prompt** at top. Default: *"This week is spent. What did you trade it for?"* Editable in settings.
- A single-paragraph field for the reflection: no formatting, no line breaks, 750-character hard cap. A character counter appears only once ~80% of the cap is used — quiet until it matters.
- A quiet **"I'm circling — draw a prompt"** link that reveals one prompt from the pool; drawing again replaces it. The last drawn prompt's id is recorded with the entry.
- One button: **Seal.** A single confirmation — "Sealed is sealed. No reading, no editing, until {unlock date}." (showing the configured unlock date) — then the entry is encrypted and the cell fills solid.

A browser-local autosave (localStorage, every few seconds while typing) protects an in-progress session from a crashed tab. It never touches the server — nothing unsealed is ever stored server-side — and is wiped on seal or when the week ends.

### Unlock and reveal

No cron. On any page load on/after the unlock date, the server flips the year to `unlocked` (idempotent transition) and enqueues the reflection job. The UI plays a deliberate reveal — cells fill across the grid in week order, entries appearing readable below in sequence, gaps shown honestly — then presents the AI reflection when ready.

### AI reflection

A provider interface — `generateReflection(entries, year) → text` — with two implementations:

- **Anthropic API** (default model: `claude-sonnet-5`, configurable)
- **Ollama** (local model, host configurable)

Provider, model, and credentials are set in settings. The reflection prompt asks for patterns, recurring themes, contradictions, and change across the year — a stoic friend reading your journal, not a summary. The job runs async with visible status; entries are always readable regardless of its outcome. On failure, a "retry reflection" button re-runs it. Regeneration is allowed and keeps only the latest version — the entries are the artifact, not the essay.

### Archive

Unlocked years live behind the "past years" footer link. Opening one shows its grid, entries, and reflection, readable anytime. On January 1 a fresh grid simply begins (the new `years` row is created lazily on first visit).

## UI design

**Aesthetic.** Strictly black and white — pure monochrome with grayscale shades, no accent color anywhere. Minimalist, modern, sleek: one screen, generous whitespace, no nav bar, no cards, no chrome. Dark mode is a clean inversion of light mode.

**Layout.** A single centered page, two elements stacked:

1. **The year grid** — GitHub-contribution-style boxes: 52 small rounded squares in a 13×4 grid (each row one quarter of the year), week 1 top-left, reading left to right. Hovering/tapping a cell shows its week dates (and sealed-at time, if sealed) in a minimal tooltip.
2. **The writing surface** directly below: the anchor prompt set large, the single-paragraph input under it, the quiet "I'm circling — draw a prompt" link, and the black **Seal** button. No view transitions — the ritual is one screen.

The archive is a quiet footer link ("past years"); settings hide behind a small glyph. No other navigation exists.

**Cell states** (all distinguishable in pure grayscale):
- *Sealed:* solid black (solid white in dark mode).
- *Current:* empty with a distinct ring/outline and a slow breathing emphasis.
- *Missed:* faint outline crossed by a thin diagonal strike — unmistakably forfeited, never clickable.
- *Future:* barely-there hairline outline.
At a glance the grid reads as the year draining away.

**Typography.** A modern grotesque sans (e.g., Inter/Geist) for everything, with a monospaced face for week numbers, dates, and metadata. Hierarchy comes from size and weight, never color.

**Motion.** Two hero animations plus a layer of quiet micro-interactions — all fast, eased, and monochrome; nothing bounces or draws attention to itself.

Hero moments:
- *Sealing:* on confirm, the current cell fills to solid black with a short, firm press-in (~1s). It should feel irreversible.
- *Unlock reveal:* cells fill in week order across the grid, paced; then the entries appear in order below where the writing surface was, followed by the AI reflection. Skippable, but paced by default.

Micro-interactions (each ≤300ms):
- *Grid entrance:* on page load, cells stagger in with a subtle fade — a brief wave across the year, then still.
- *Cell hover/tap:* a slight scale-up with the tooltip fading in; sealed cells feel solid, future cells barely respond.
- *Current-week ring:* the slow breathing emphasis (the one always-running animation, and it's subtle).
- *Prompt draw:* the drawn prompt fades and settles in below the anchor prompt; drawing again crossfades.
- *Character counter:* fades in near the cap rather than popping.
- *Seal button:* a firm pressed state on click, leading into the sealing animation.

Respect `prefers-reduced-motion`: hero animations collapse to simple fades, micro-interactions to instant states.

**After unlock.** The space below the grid becomes the reading pane: all entries in order, gaps honestly marked, the reflection at the end. Clicking any filled cell jumps to its entry.

**Mobile.** The same layout scales down: the grid compresses (cells shrink, gaps tighten) and the writing surface sits below the fold if needed. No separate mobile layout.

## Error handling

- **Missing/invalid encryption key:** refuse to start, with a clear message (canary check at startup).
- **Double-seal / race:** guarded by the unique `(year, week_number)` constraint inside a transaction; a second submit returns "already sealed," never overwrites.
- **Seal outside the current week:** rejected server-side; this is also what enforces "missed = empty forever."
- **Over-long or multi-paragraph content:** rejected server-side (750-character cap, line breaks stripped/refused) — the UI cap is convenience, the server cap is the rule.
- **Sealing after unlock:** sealing the current week remains allowed even once the year is unlocked (e.g., week 52 on Dec 31). The entry is simply readable immediately, and the reflection can be regenerated to include it.
- **LLM failures at unlock:** unlock never depends on the LLM. Reflection has `pending/running/done/failed` states; provider errors (bad key, unreachable Ollama, rate limits) surface as readable status with retry, never a broken page.
- **Writing-session loss:** localStorage autosave, restored on return, cleared on seal or week end.
- **Data safety:** README documents that backup = SQLite file + keyfile together; ciphertext without the key is unrecoverable by design.

## Testing (Vitest)

- **Week math** — date→week mapping at year boundaries, week 52 absorbing the year's tail, `TZ` handling. The highest-risk pure logic.
- **Crypto round-trip** — seal → ciphertext in DB (assert plaintext absent) → unreadable while `active` → decrypts after unlock.
- **API rules** — reject double-seal, past/future-week seals, and over-cap or multi-paragraph content; sealed-entry endpoints return metadata only before unlock; unlock transition is idempotent.
- **Reflection lifecycle** — with a mocked provider: pending→done, failure→retry. Anthropic/Ollama adapters kept thin so mocks stay honest.
- **Stretch (not a gate):** one Playwright smoke test — write → seal → cell fills.

## Out of scope (deliberately)

- Accounts, multi-user, sharing.
- Notifications/reminders (self-hosted; use your own calendar if wanted).
- Editing or deleting sealed entries, ever.
- True cryptographic time-lock.
- Mobile apps (the web UI should simply work well on a phone).
