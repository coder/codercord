import { config } from "@lib/config.js";

import {
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from "discord.js";

const options = [
  new StringSelectMenuOptionBuilder()
    .setLabel("Linux")
    .setValue("linux")
    .setEmoji(config.emojis.linux),

  new StringSelectMenuOptionBuilder()
    .setLabel("Windows")
    .setValue("windows")
    .setEmoji(config.emojis.windows),

  new StringSelectMenuOptionBuilder()
    .setLabel("macOS")
    .setValue("macos")
    .setEmoji(config.emojis.macos),
];

export default new StringSelectMenuBuilder()
  .setCustomId("operatingSystemFamilySelector")
  .setPlaceholder("Choose an operating system family")
  .addOptions(options);
