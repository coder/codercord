import {
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from "discord.js";

const options = [
  new StringSelectMenuOptionBuilder()
    .setLabel("Help needed")
    .setValue("help")
    .setEmoji("🙋"),

  new StringSelectMenuOptionBuilder()
    .setLabel("Bug report")
    .setValue("bug")
    .setEmoji("🧩"),

  new StringSelectMenuOptionBuilder()
    .setLabel("Feature request")
    .setValue("feature")
    .setEmoji("✨"),

  new StringSelectMenuOptionBuilder()
    .setLabel("Other")
    .setValue("other")
    .setEmoji("❓"),
];

export default new StringSelectMenuBuilder()
  .setCustomId("issueCategorySelector")
  .setPlaceholder("Choose an issue category")
  .addOptions(options);
