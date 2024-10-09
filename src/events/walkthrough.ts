import issueCategorySelector from "../ui/components/issueCategorySelector.js";
import productSelector, { messageData as productSelectorMessageData } from "../ui/components/productSelector.js";
import operatingSystemFamilySelector, { messageData as operatingSystemFamilySelectorMessageData } from "../ui/components/operatingSystemFamilySelector.js";

import { type Client, Events } from "discord.js";

export default function registerEvents(client: Client) {
    return client.on(Events.InteractionCreate, async (interaction) => {
        if(interaction.isStringSelectMenu()) {
            if(interaction.customId === issueCategorySelector.data.custom_id) {
                await interaction.update(productSelectorMessageData);
            } else if(interaction.customId === productSelector.data.custom_id) {
                await interaction.update(operatingSystemFamilySelectorMessageData);
            } else if(interaction.customId === operatingSystemFamilySelector.data.custom_id) {
                await interaction.update("hi");
            }
        }
    });
}