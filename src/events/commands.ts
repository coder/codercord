import commands from "@commands/index.js";

import { type Client, Events, MessageFlags } from "discord.js";

export default function registerEvents(client: Client) {
  return client.on(Events.InteractionCreate, async (interaction) => {
    if (
      interaction.isChatInputCommand() ||
      interaction.isMessageContextMenuCommand()
    ) {
      const command = commands[interaction.commandName];

      if (!command) {
        console.error(
          "[commands]",
          "no command matching",
          interaction.commandName,
        );
        return;
      }

      try {
        await command.execute(interaction);
      } catch (error) {
        console.error("[commands]", "execution failed", error);

        // TODO: make generic replyOrFollowUp method
        // TODO: log error if the user is admin
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({
            content: "There was an error while executing this command!",
            flags: MessageFlags.Ephemeral,
          });
        } else {
          await interaction.reply({
            content: "There was an error while executing this command!",
            flags: MessageFlags.Ephemeral,
          });
        }
      }
    }
  });
}
