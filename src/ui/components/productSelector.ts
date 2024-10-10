import { config } from "@lib/config.js";

import { StringSelectMenuBuilder, StringSelectMenuOptionBuilder } from "discord.js";

const options = [
    new StringSelectMenuOptionBuilder()
        .setLabel("Coder OSS (v2)")
        .setValue("coder")
        .setEmoji(config.emojis.coder),
    
    new StringSelectMenuOptionBuilder()
        .setLabel("code-server")
        .setValue("code-server")
        .setEmoji(config.emojis.vscode),
];

export default new StringSelectMenuBuilder()
    .setCustomId("productSelector")
    .setPlaceholder("Choose a product")
    .addOptions(options);
