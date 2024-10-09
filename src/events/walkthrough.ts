import { doWalkthrough, generateMessage } from "@commands/util/walkthrough.js"

import issueCategorySelector from "@components/issueCategorySelector.js";
import productSelector from "@components/productSelector.js";
import operatingSystemFamilySelector from "@components/operatingSystemFamilySelector.js";

import { type Client, EmbedBuilder, Events } from "discord.js";

export default function registerEvents(client: Client) {
    // Do walkthrough whenever a thread is opened
    client.on(Events.ThreadCreate, async (channel) => doWalkthrough(channel));

    // Register events for the actual walkthrough steps
    client.on(Events.InteractionCreate, async (interaction) => {
        if(interaction.isStringSelectMenu()) {
            let message;

            // TODO : make this code more generic
            if(interaction.customId === issueCategorySelector.data.custom_id) {
                const dataEmbed = new EmbedBuilder()
                    .setTitle(`<#${interaction.channelId}>`)
                    .addFields([
                        { name: "Category", value: interaction.values[0], inline: true },
                        { name: "Product", value: "N/A", inline: true },
                        { name: "Platform", value: "N/A", inline: true },
                        { name: "Logs", value: "Please post any relevant logs/error messages." },
                    ]);
                
                message = generateMessage("What product are you using?", productSelector, [dataEmbed]);
            } else if(interaction.customId === productSelector.data.custom_id) {
                // Grab the embed from the last message and edit the "Product" field
                const dataEmbed = interaction.message.embeds[0];
                dataEmbed.fields[1].value = interaction.values[0];

                // TODO: replace "the product" by the name of the product that was chosen in the previous step (productSelector)
                message = generateMessage("What operating system are you running the product on?", operatingSystemFamilySelector, [ dataEmbed ]);
            } else if(interaction.customId === operatingSystemFamilySelector.data.custom_id) {
                // Grab the embed from the last message and edit the "Product" field
                const dataEmbed = interaction.message.embeds[0];
                dataEmbed.fields[2].value = interaction.values[0];

                // Generate an empty message with just the data embed
                message = { components: [], embeds: [ dataEmbed ] };

                // TODO: pin
            }

            await interaction.update(message);
        }
    });
}