# Codercord Agent Guidelines

Discord bot for the Coder community server. TypeScript on Bun, using
discord.js v14.

## Stack

- **Runtime**: [Bun](https://bun.sh) (ESM, `"type": "module"`). No build step
  for local dev, Bun runs the TypeScript entrypoint directly.
- **Library**: [discord.js v14](https://discord.js.org/docs) (Gateway +
  slash/context-menu commands, Components V2). For the underlying platform,
  see the [Discord developer docs](https://discord.dev).
- **Tooling**: [Biome](https://biomejs.dev) for formatting and linting.
- **HTTP**: `ofetch` for outbound API calls (e.g. ProductBoard).
- **Config**: `@uwu/configmasher`.

## Commands

| Task            | Command            | Notes                                  |
|-----------------|--------------------|----------------------------------------|
| Run             | `bun start`        | Starts the bot (`bun .`).              |
| Watch           | `bun watch`        | Restarts on file change.               |
| Format          | `bun format`       | Biome, writes changes.                 |
| Lint            | `bun lint`         | Biome, writes fixes.                   |
| Deploy commands | `bun src/deploy-commands.ts` | Registers guild slash commands. |

CI runs `bun format:ci` and `bun lint:ci` (report-only, non-writing). Run
`bun format` and `bun lint` locally before pushing so CI passes.

There is no test suite.

## Project layout

```
src/
  index.ts              Entrypoint: builds the Client, registers events, logs in.
  deploy-commands.ts    Registers slash/context commands with the guild.
  commands/
    index.ts            Aggregates every command into a name -> command map.
    util/               close, reopen, walkthrough.
    product/            notes (ProductBoard context-menu command).
  events/               commands, messages, channels, walkthrough, bridge handlers.
  bridge/
    linear/             Discord -> Linear mirror (client, api, orchestration).
  lib/
    config.ts           Typed config loader + mandatory field list.
    discord/            channels, users, messages, help, helpThread helpers.
  ui/components/        StringSelectMenu builders for the walkthrough.
scripts/
  discord-linear-sync.ts  One-shot Linear backfill (bun run sync:linear).
assets/tags.json        Canned response text.
```

## Linear bridge

The Linear bridge (`src/events/bridge.ts`) registers its own Discord listeners
(`ThreadCreate`, `MessageCreate`, `ThreadUpdate`) and mirrors #help forum posts
into Linear via `src/bridge/linear`. It reads enriched thread state through
`new HelpThread(thread)` (`src/lib/discord/helpThread.ts`), whose getters derive
status/waiting/tags from the thread's applied tags. Disabled by default via
`config.linearBridge.enabled`.

## Conventions

- **Imports**: Use the `.js` extension on relative imports (ESM/NodeNext),
  even though the source is `.ts`. Prefer the `tsconfig` path aliases:
  `@lib/*`, `@commands/*`, `@events/*`, `@components/*`.
- **Formatting** (enforced by Biome): 2-space indent, 80-char line width.
  Biome ignores `package.json`, `bun.lockb`, and `*.md`.
- **Adding a command**: create it under `src/commands/`, export a
  `{ data, execute }` default, then add it to the array in
  `src/commands/index.ts`. Run `bun src/deploy-commands.ts` to register it.
- **Adding an event handler**: export a `registerEvents(client)` default and
  call it from `src/index.ts`.
- **Commits**: `type(scope): message` (e.g. `chore: update example config`).

## Configuration

`@uwu/configmasher` merges, in order: `defaults` -> `config.json` ->
environment file -> process environment. Keys are **case-sensitive**.

- Copy `config.json.example` to `config.json` (gitignored) for local IDs.
- Secrets come from the environment, e.g. `Codercord_token` (the bot token).
- The Linear bridge API key is a secret too: `Codercord_linearBridge__apiKey`
  (nested keys use `__`). `linearBridge.teamId` and `enabled` live in
  `config.json`; the bridge exits at startup if enabled without apiKey/teamId.
- Mandatory fields are declared in `src/lib/config.ts`; the process exits if
  any are missing.

## Runtime notes

- **Stay stateless**: the bot keeps no persistent store. All state lives on
  Discord's servers (channels, tags, pinned messages) plus a few clever hacks,
  so any change should ideally survive a restart. Avoid relying on in-memory
  state that is lost when the process dies; if you must hold state in memory,
  keep it ephemeral and reconstructable from Discord.
- Intents: `Guilds` and `GuildMessages` only.
- The bot targets a single guild (`serverId`); commands are registered
  per-guild, not globally.
- The help forum flow (walkthrough, `/close`, `/reopen`, auto-tagging) keys
  off `helpChannel` IDs and tag IDs from config.

## Deployment

Pushing to `main` triggers `.github/workflows/deploy-docker.yaml`, which
builds the `Dockerfile` (`oven/bun:1`) and publishes the image to GHCR with a
build-provenance attestation.
