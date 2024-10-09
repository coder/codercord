import * as commands from "@commands/index.js";

import { type Client, Events } from "discord.js";

export default function registerEvents(client: Client) {
    return client.on(Events.InteractionCreate, async (interaction) => {
        if (interaction.isChatInputCommand()) {
          const command = commands[interaction.commandName];
      
          if (!command) {
            console.error(`No command matching ${interaction.commandName} was found.`);
            return;
          }
      
          try {
            await command.execute(interaction);
          } catch (error) {
            console.error(error);
      
            if (interaction.replied || interaction.deferred) {
              await interaction.followUp({
                content: "There was an error while executing this command!",
                ephemeral: true,
              });
            } else {
              await interaction.reply({
                content: "There was an error while executing this command!",
                ephemeral: true,
              });
            }
          }
        }
    });
}