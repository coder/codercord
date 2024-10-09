import { ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } from "discord.js";
import { config } from "lib/config.js";

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
        .setEmoji(config.emojis.macos)
];

const component = new StringSelectMenuBuilder()
    .setCustomId("operatingSystemFamilySelector")
    .setPlaceholder("Choose an operating system family")
    .addOptions(options);

// TODO: replace "the product" by the name of the product that was chosen in the previous step (productSelector)
const messageData = {
    content: "What operating system are you running the product on?",
    components: [
        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(component),
    ]
}

export { component as default, messageData }