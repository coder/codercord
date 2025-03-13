import { config } from "@lib/config.js";
import { makeCodeBlock } from "@lib/discord/messages.js";

import { ofetch } from "ofetch";

import {
  ContextMenuCommandBuilder,
  ApplicationCommandType,
  type MessageContextMenuCommandInteraction,
  MessageFlags,
  ActionRowBuilder,
  ButtonStyle,
  ButtonBuilder,
} from "discord.js";

// TODO: try to make the official API package work
async function createNote(body) {
  return ofetch("https://api.productboard.com/notes", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.productBoard.token}`,
    },
    body,
  });
}

export default {
  data: new ContextMenuCommandBuilder()
    .setName("Add to product notes")
    .setType(ApplicationCommandType.Message),

  execute: async (interaction: MessageContextMenuCommandInteraction) => {
    const data = await createNote({
      title: `Discord message from ${interaction.targetMessage.author.displayName} (in '${interaction.channel.name}')`, // this will only work for threads
      display_url: interaction.targetMessage.url,
      content: interaction.targetMessage.content,

      company: { id: config.productBoard.companyId },
      user: { external_id: `discord:${interaction.targetMessage.author.id}` },

      source: { origin: "discord", record_id: interaction.targetId },
      tags: [ "discord" ],
    });

    const replyComponents = [];

    if (data.links?.html) {
      const button = new ButtonBuilder()
        .setLabel("Open in ProductBoard")
        .setStyle(ButtonStyle.Link)
        .setURL(data.links.html);

      replyComponents.push(
        new ActionRowBuilder<ButtonBuilder>().addComponents(button),
      );
    }

    await interaction.reply({
      content: makeCodeBlock(JSON.stringify(data), "json"),

      components: replyComponents,

      flags: MessageFlags.Ephemeral,
    });
  },
};
