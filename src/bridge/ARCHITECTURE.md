# Bridge architecture

The bridge mirrors community conversations into Linear. Today it runs one way,
Discord `#help` -> Linear, but the code is organized around a source-agnostic
model so more platforms (e.g. GitHub Discussions) and the reverse direction can
be added without threading platform specifics through the whole system.

## Layout

```
src/bridge/
  core/      # platform-agnostic: model, interfaces, orchestration, reconciler
  discord/   # Discord connector: listeners + model mapping
  linear/    # Linear connector: the hub store, split by concern
```

- `core/model.ts` - the shared vocabulary: `Post`, `Message`, `Author`,
  `Attachment`, `Reaction`, `Reference`, `Label`, and `ExternalRef`
  (`{ source, id, url }`). A connector maps its native objects onto these.
- `core/connector.ts` - the `Source` and `Target` capability interfaces.
- `core/mirror.ts` - `Mirror`, the orchestrator. Consumes model objects a
  connector produces and drives the `Target`. All logic here is source-agnostic.
- `core/reconciler.ts` - maps a post's lifecycle onto the hub workflow state.
- `core/references.ts` - extractors for cross-links (other threads, GitHub
  issues) that any connector can reuse.
- `core/backfill.ts` - rate-limit retry used by startup import.
- `discord/` - `DiscordConnector` (a `Source`) plus `map.ts`, which converts
  discord.js objects into the model (mentions, emojis, attachments, references).
- `linear/` - the hub, split into `client`, `issues`, `comments`, `reactions`,
  `labels`, `emojis`, `attachments`, `state`, `assets`, with `index.ts` exposing
  `LinearConnector` (a `Target`).

## Source and Target are capabilities, not layers

Everything syncs both ways eventually, so a platform is one module, not split
across "source" and "target" folders. `Source` (reads events, enumerates for
backfill, writes the hub link back) and `Target` (the hub store) are capability
interfaces. Discord implements `Source` today; Linear implements `Target`. When
a platform's reverse direction is built, its connector grows the other
capability rather than moving between folders.

## Identity and mapping

A conversation maps to one hub issue. The mapping lives in a Linear **attachment**
on the issue whose `url` is the source conversation's canonical URL; lookups are
scoped to the configured team so a shared link (e.g. a GitHub URL attached to an
unrelated issue) never resolves cross-team.

Mirrored comments carry an invisible marker, a markdown reference-link definition
`[<source>-msg]: <id>`, so a later edit/delete/reply finds the right comment. The
marker is namespaced per source; Discord's is `discord-msg`.

**Cardinality (future).** One issue is the hub, linked to N source entities at
once: the same conversation can map to a Discord thread and a GitHub discussion
via one attachment each. The marker's source namespace keeps per-source comments
distinct on the shared issue.

## Reconciliation model

- **Posts always originate at a source.** Nothing is created in Linear; Linear
  is a relay hub.
- **The originating source is authoritative for its own content**: title, body,
  lifecycle (open/closed and waiting state), and messages. If a source and Linear
  disagree on a source-owned field, the source wins.
- **Linear relays A -> Linear -> B.** The hub holds cross-source identity but
  does not author content.
- **No historical catch-up for Linear-originated changes.** Linear edits
  propagate only when received live. Propagation of Linear-originated *comments*
  is an open question, deferred.
- **State transitions are computed against the current hub state**, not a source
  old/new diff, so out-of-band changes (e.g. a `/close` command) are detected
  reliably. See `core/reconciler.ts`: closed -> Done, waiting-on-user -> Blocked,
  waiting-on-team -> In Progress, with a new live thread held in Triage until the
  team engages; backfilled threads bypass that gate.

## Future work (not built)

- **Reverse direction (Linear -> source).** The intended inbound channel is
  **Linear webhooks** (the SDK ships a webhook client). Each connector would grow
  the write side of its platform.
- **Echo suppression.** Every mirrored write is tagged with its origin (comments
  already carry the source marker). Inbound events that match a mirror we just
  wrote must be ignored so a `Linear -> Discord` write does not bounce back as a
  new Discord event and loop. Only the origin tagging exists today; the ignore
  step lands with the reverse direction.
- **GitHub Discussions.** A new `github/` connector implementing `Source`,
  reusing `core` unchanged. Its marker namespace would be `github-msg`.
