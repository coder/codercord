import {
  buildWalkthroughMessage,
  doWalkthrough,
} from "@commands/util/walkthrough.js";

import issueCategorySelector from "@components/issueCategorySelector.js";
import productSelector from "@components/productSelector.js";
import operatingSystemFamilySelector from "@components/operatingSystemFamilySelector.js";

import { type Client, EmbedBuilder, Events } from "discord.js";

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

  // Each selection edits the single walkthrough message in place.
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
    const dataEmbed = EmbedBuilder.from(interaction.message.embeds[0]);
    dataEmbed.data.fields[index].value = getLabelFromValue(
      interaction.values[0],
      selector,
    );

    const nextSelector = selectors[index + 1];
    const step = lastStep
      ? undefined
      : {
          question:
            nextSelector === productSelector
              ? "What product are you using?"
              : `What operating system are you running ${dataEmbed.data.fields[index].value} on?`,
          selector: nextSelector,
        };

    await interaction.update(
      buildWalkthroughMessage(dataEmbed, interaction.message.embeds[1], step),
    );

    // If this is the last step of the walkthrough, we pin the message
    if (lastStep) {
      await interaction.message.pin();
    }
  });
}
