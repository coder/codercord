import { config } from "@lib/config.js";

import type { Client } from "discord.js";

// Resolves a slash command mention (</name:id>) by looking the command ID up
// from the ones the bot registered in the guild. Falls back to plain text if
// the command cannot be found.
export async function getCommandMention(
  client: Client,
  name: string,
): Promise<string> {
  const commands = await client.application.commands.fetch({
    guildId: config.serverId,
  });

  const command = commands.find((cmd) => cmd.name === name);

  return command ? `</${command.name}:${command.id}>` : `/${name}`;
}
