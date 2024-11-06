import { doWalkthrough, generateQuestion } from "@commands/util/walkthrough.js";

import issueCategorySelector from "@components/issueCategorySelector.js";
import productSelector from "@components/productSelector.js";
import operatingSystemFamilySelector from "@components/operatingSystemFamilySelector.js";

import {
  type Client,
  EmbedBuilder,
  Events,
  type InteractionUpdateOptions,
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

// TODO: make this readable
export default function registerEvents(client: Client) {
  // Do walkthrough whenever a thread is opened
  client.on(Events.ThreadCreate, async (channel) => doWalkthrough(channel));

  // Register events for the actual walkthrough steps
  client.on(Events.InteractionCreate, async (interaction) => {
    if (interaction.isStringSelectMenu()) {
      let message: InteractionUpdateOptions;

      const selector = selectors.filter(
        (element) => element.data.custom_id === interaction.customId,
      )[0];
      const index = selectors.indexOf(selector);

      const nextSelector = selectors[index + 1];

      if (index === 0) {
        const dataEmbed = new EmbedBuilder()
          .setTitle(`<#${interaction.channelId}>`)
          .addFields([
            {
              name: "Category",
              value: getLabelFromValue(interaction.values[0], selector),
              inline: true,
            },
            { name: "Product", value: "N/A", inline: true },
            { name: "Platform", value: "N/A", inline: true },
            {
              name: "Logs",
              value: "Please post any relevant logs/error messages.",
            },
          ]);

        message = generateQuestion(
          "What product are you using?",
          productSelector,
          [dataEmbed],
        );
      } else {
        // Grab the embed from the last message and edit the corresponding field with the human-readable field (instead of the ID)
        const dataEmbed = interaction.message.embeds[0];
        dataEmbed.fields[index].value = getLabelFromValue(
          interaction.values[0],
          selector,
        );

        // TODO : make this part more generic once we have more questions
        if (selector === productSelector) {
          message = generateQuestion(
            `What operating system are you running ${dataEmbed.fields[index].value} on?`,
            nextSelector,
            [dataEmbed],
          );
        } else if (index + 1 === selectors.length) {
          // <- means this is the last step of the walkthrough
          // Generate an empty message with just the data embed and pin it
          message = { components: [], embeds: [dataEmbed] };

          await interaction.message.pin();
        } else {
          throw new Error("No case matches this walkthrough step");
        }
      }

      await interaction.update(message);
    }
  });
}
