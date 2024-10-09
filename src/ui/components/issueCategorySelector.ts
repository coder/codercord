import { ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } from "discord.js";

const options = [
    new StringSelectMenuOptionBuilder()
        .setLabel("Help needed")
        .setValue("help"),
    
    new StringSelectMenuOptionBuilder()
        .setLabel("Bug report")
        .setValue("bug"),
    
    new StringSelectMenuOptionBuilder()
        .setLabel("Feature request")
        .setValue("feature"),
    
    new StringSelectMenuOptionBuilder()
        .setLabel("Other")
        .setValue("other")
];

export default new StringSelectMenuBuilder()
    .setCustomId("issueCategorySelector")
    .setPlaceholder("Choose an issue category")
    .addOptions(options);