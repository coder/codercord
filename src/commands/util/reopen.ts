import { handleIssueStateCommand } from "./close.js";

import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";

export default {
  data: new SlashCommandBuilder()
    .setName("reopen")
    .setDescription("Reopens your issue"),

  execute: (interaction: ChatInputCommandInteraction) =>
    handleIssueStateCommand(interaction, false, false),
};
