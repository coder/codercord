import * as commands from "./commands/index.js";
import { config } from "./lib/config.js";

import issueCategorySelector from "./components/issueCategorySelector.js";
import productSelector, { messageData as productSelectorMessageData } from "./components/productSelector.js";
import operatingSystemFamilySelector, { messageData as operatingSystemFamilySelectorMessageData } from "./components/operatingSystemFamilySelector.js";

import { Client, Events } from "discord.js";

const client = new Client({ intents: [] });

client.on(Events.InteractionCreate, async (interaction) => {
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
  } else if(interaction.isStringSelectMenu()) {
    if(interaction.customId === issueCategorySelector.data.custom_id) {
      await interaction.update(productSelectorMessageData);
    } else if(interaction.customId === productSelector.data.custom_id) {
      await interaction.update(operatingSystemFamilySelectorMessageData);
    } else if(interaction.customId === operatingSystemFamilySelector.data.custom_id) {
      await interaction.update("hi");
    }
  }
});

client.once(Events.ClientReady, () => {
  console.log(`Logged in as ${client.user?.tag}!`);
});

client.login(config.token);
