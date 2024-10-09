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

const component = new StringSelectMenuBuilder()
    .setCustomId("issueCategorySelector")
    .setPlaceholder("Choose an issue category")
    .addOptions(options);

const messageData = {
    content: "What are you creating this issue for?",
    components: [
        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(component),
    ]
}

export { component as default, messageData }