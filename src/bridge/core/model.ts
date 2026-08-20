// Source-agnostic domain model shared by every bridge connector. A connector
// maps its platform's native objects onto these types; the core orchestrator and
// the hub (Linear) speak only this vocabulary, so a new platform is just another
// connector rather than changes threaded through the whole bridge.

// Platforms the bridge knows about. Discord and Linear exist today; github is
// reserved for the planned GitHub Discussions connector.
export type SourceId = "discord" | "linear" | "github";

// Identifies an entity on its origin platform. `url` is the canonical link used
// to locate the matching hub issue (via its attachments); `id` is the native id.
export interface ExternalRef {
  source: SourceId;
  id: string;
  url: string;
}

// External author of mirrored content, for attribution on the hub.
export interface Author {
  name: string;
  iconUrl?: string;
}

// A custom emoji that the hub must register before its shortcode renders.
export interface CustomEmoji {
  id: string;
  animated: boolean;
}

export interface Attachment {
  name: string;
  url: string;
  contentType: string | null;
  isImage: boolean;
}

// A reaction normalized to the hub's key: a registered `discord-<id>` shortcode
// for custom emojis, or the unicode character for standard ones. `custom` is set
// when the hub must register the emoji first.
export interface Reaction {
  key: string;
  custom?: CustomEmoji;
}

// A source tag mirrored as a hub label. `id` is the source tag id, stored in the
// label description so the mapping survives restarts.
export interface Label {
  id: string;
  name: string;
}

export type Lifecycle = "open" | "closed";
export type Waiting = "user" | "team" | null;

// Descriptor for the hub attachment that links an issue back to its source
// conversation. The source supplies the exact strings/metadata so the hub only
// stores them, keeping the on-the-wire shape owned by the connector.
export interface SourceAttachment {
  title: string;
  subtitle: string;
  metadata: Record<string, unknown>;
}

// The opening entity of a mirrored conversation (a Discord forum post, later a
// GitHub discussion). Maps to one hub issue.
export interface Post {
  ref: ExternalRef;
  title: string;
  // Rendered starter text (mentions and emojis resolved), used verbatim as the
  // issue description. Attachments are intentionally not composed in here to
  // match the hub's existing description shape.
  body: string;
  author?: Author;
  customEmojis: CustomEmoji[];
  references: Reference[];
  labels: Label[];
  lifecycle: Lifecycle;
  waiting: Waiting;
  closedAt: Date | null;
  createdAt?: Date;
  attachment: SourceAttachment;
}

// A single message within a conversation. The starter message is represented by
// the Post, not a Message.
export interface Message {
  ref: ExternalRef;
  author?: Author;
  // Rendered text (mentions and emojis resolved, reference tokens still present
  // for the orchestrator to rewrite). Attachments are composed by the hub.
  text: string;
  attachments: Attachment[];
  customEmojis: CustomEmoji[];
  references: Reference[];
  replyToId?: string;
  createdAt?: Date;
}

// A reference to another entity found in mirrored content. `url` is the canonical
// link used to locate a matching hub issue; `token` is the exact substring in
// the content to rewrite when a match is found.
export interface Reference {
  url: string;
  token: string;
}

// Composes a message body from its text and attachments, resolving each
// attachment URL via urlFor (a CDN link for the fast path, a re-hosted asset URL
// for the durable path). Images render inline, other files as links.
export function composeBody(
  text: string,
  attachments: Attachment[],
  urlFor: (a: Attachment) => string,
): string {
  const parts: string[] = [];
  const trimmed = text.trim();
  if (trimmed) parts.push(trimmed);
  for (const a of attachments) {
    const link = `[${a.name}](${urlFor(a)})`;
    parts.push(a.isImage ? `!${link}` : link);
  }
  return parts.join("\n\n");
}
