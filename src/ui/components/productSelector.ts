import { ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } from "discord.js";
import { config } from "lib/config.js";

const options = [
    new StringSelectMenuOptionBuilder()
        .setLabel("Coder OSS (v2)")
        .setValue("Coder OSS (v2)")
        .setEmoji(config.emojis.coder),
    
    new StringSelectMenuOptionBuilder()
        .setLabel("code-server")
        .setValue("code-server")
        .setEmoji(config.emojis.vscode),
];

const component = new StringSelectMenuBuilder()
    .setCustomId("productSelector")
    .setPlaceholder("Choose a product")
    .addOptions(options);

const messageData = {
    content: "What product are you using?",
    components: [
        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(component),
    ]
}

export { component as default, messageData }