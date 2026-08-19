import { config } from "@lib/config.js";

import type { ApplicationCommand, Client, Collection } from "discord.js";

// Guild command IDs are stable for the process lifetime, so the first lookup
// is cached and reused. This avoids a Discord REST round-trip on every call,
// which matters because the walkthrough re-resolves mentions on every render.
let commandsCache: Promise<Collection<string, ApplicationCommand>> | undefined;

function fetchGuildCommands(client: Client) {
  if (!commandsCache) {
    commandsCache = client.application.commands
      .fetch({ guildId: config.serverId })
      .catch((error) => {
        // Don't cache a failed fetch; allow the next call to retry.
        commandsCache = undefined;
        throw error;
      });
  }

  return commandsCache;
}

// Resolves a slash command mention (</name:id>) by looking the command ID up
// from the ones the bot registered in the guild. Falls back to plain text if
// the command cannot be found.
export async function getCommandMention(
  client: Client,
  name: string,
): Promise<string> {
  const commands = await fetchGuildCommands(client);

  const command = commands.find((cmd) => cmd.name === name);

  return command ? `</${command.name}:${command.id}>` : `/${name}`;
}
