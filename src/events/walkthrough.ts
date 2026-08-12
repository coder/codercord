import {
  buildResourcesEmbed,
  doWalkthrough,
  productResources,
} from "@commands/util/walkthrough.js";

import issueCategorySelector from "@components/issueCategorySelector.js";
import productSelector from "@components/productSelector.js";
import operatingSystemFamilySelector from "@components/operatingSystemFamilySelector.js";

import {
  ActionRowBuilder,
  type Client,
  Colors,
  EmbedBuilder,
  Events,
  type InteractionUpdateOptions,
  type StringSelectMenuBuilder,
} from "discord.js";

// This has to follow the order of the walkthrough steps
const selectors = [
  issueCategorySelector,
  productSelector,
  operatingSystemFamilySelector,
];

function getLabelFromValue(value, selector: (typeof selectors)[number]) {
  return selector.options.filter((option) => option.data.value === value)[0]
    .data.label;
}

export default function registerEvents(client: Client) {
  // Do walkthrough whenever a thread is opened
  client.on(Events.ThreadCreate, async (channel) => doWalkthrough(channel));

  // Each selection edits the single walkthrough message in place. Its embeds
  // are [data, resources, question].
  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isStringSelectMenu()) {
      return;
    }

    const selector = selectors.find(
      (element) => element.data.custom_id === interaction.customId,
    );
    if (!selector) {
      return;
    }

    const index = selectors.indexOf(selector);
    const lastStep = index + 1 === selectors.length;

    // Fill the answered field in the data embed with its human-readable label.
    const dataEmbed = interaction.message.embeds[0];
    dataEmbed.fields[index].value = getLabelFromValue(
      interaction.values[0],
      selector,
    );

    // Rebuild the resources embed once the product is picked so its
    // documentation links match the chosen product.
    let resourcesEmbed = EmbedBuilder.from(interaction.message.embeds[1]);
    if (selector === productSelector) {
      resourcesEmbed = await buildResourcesEmbed(
        interaction.client,
        productResources[interaction.values[0]] ?? [],
      );
    }

    let messageData: InteractionUpdateOptions;

    if (lastStep) {
      messageData = { embeds: [dataEmbed, resourcesEmbed], components: [] };
    } else {
      const nextSelector = selectors[index + 1];
      const question =
        nextSelector === productSelector
          ? "What product are you using?"
          : `What operating system are you running ${dataEmbed.fields[index].value} on?`;

      messageData = {
        embeds: [
          dataEmbed,
          resourcesEmbed,
          new EmbedBuilder().setColor(Colors.White).setDescription(question),
        ],
        components: [
          new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
            nextSelector,
          ),
        ],
      };
    }

    await interaction.update(messageData);

    // If this is the last step of the walkthrough, we pin the message
    if (lastStep) {
      await interaction.message.pin();
    }
  });
}
