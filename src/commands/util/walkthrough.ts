import { config } from "@lib/config.js";

import { isHelpPost as isHelpThread } from "@lib/discord/channels.js";
import { getCommandMention } from "@lib/discord/commands.js";
import issueCategorySelector from "@components/issueCategorySelector.js";

import {
  type ChatInputCommandInteraction,
  type Client,
  SlashCommandBuilder,
  ActionRowBuilder,
  type StringSelectMenuBuilder,
  EmbedBuilder,
  type Embed,
  Colors,
  type PublicThreadChannel,
  type GuildTextBasedChannel,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  SectionBuilder,
  TextDisplayBuilder,
  type MessageCreateOptions,
  type InteractionReplyOptions,
} from "discord.js";

type ResourceLink = { label: string; url: string };

// Documentation resources keyed by product. Products without an entry (for
// example code-server) simply get no resource links.
export const productResources: Record<string, ResourceLink[]> = {
  coder: [
    {
      label: "Where to find logs",
      url: "https://coder.com/docs/admin/monitoring/logs",
    },
    {
      label: "Troubleshooting templates",
      url: "https://coder.com/docs/admin/templates/troubleshooting",
    },
    {
      label: "Troubleshooting networking",
      url: "https://coder.com/docs/admin/networking/troubleshooting",
    },
  ],
};

// Builds the walkthrough resources card. Given product resources it shows their
// documentation links; otherwise it shows the post lifecycle commands, which is
// what goes out as soon as the walkthrough starts.
export async function buildResourcesMessage(
  client: Client,
  resources: ResourceLink[],
) {
  const container = new ContainerBuilder();

  if (resources.length > 0) {
    container.addSectionComponents(
      resources.map((resource) =>
        new SectionBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder({ content: resource.label }),
          )
          .setButtonAccessory(
            new ButtonBuilder()
              .setStyle(ButtonStyle.Link)
              .setLabel("Docs")
              .setURL(resource.url),
          ),
      ),
    );
  } else {
    container.addTextDisplayComponents(
      new TextDisplayBuilder({
        content: `When your issue is resolved, use ${await getCommandMention(client, "close")} to close this issue. Use ${await getCommandMention(client, "reopen")} to reopen it if needed.`,
      }),
    );
  }

  return {
    flags: MessageFlags.IsComponentsV2,
    components: [container],
  };
}

export function generateQuestion(
  question: string,
  component: StringSelectMenuBuilder,
  embeds: (EmbedBuilder | Embed)[] = [],
) {
  return {
    embeds: [
      ...embeds,
      new EmbedBuilder().setColor(Colors.White).setDescription(question),
    ],
    components: [
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(component),
    ],
  };
}

export async function doWalkthrough(
  channel: GuildTextBasedChannel,
  interaction?: ChatInputCommandInteraction,
) {
  if (await isHelpThread(channel)) {
    const threadChannel = channel as PublicThreadChannel; // necessary type cast, isHelpThread does the check already

    const resourcesMessage = await buildResourcesMessage(channel.client, []);

    // Check for tags in the forum post
    const appliedTags = threadChannel.appliedTags ?? [];
    if (!appliedTags.includes(config.helpChannel.openedTag)) {
      appliedTags.push(config.helpChannel.openedTag);
      threadChannel.setAppliedTags(appliedTags);
    }

    // Send the resources message (or reply to the user if they're running the command)
    if (interaction) {
      // TODO: also check for components V2, but wait until revamp
      // If the bot has sent a message that contains an embed in the first 30 messages, then we assume it's the walkthrough message
      const firstMessage = await threadChannel.fetchStarterMessage();
      const walkthroughMessage = await threadChannel.messages
        .fetch({ around: firstMessage.id, limit: 30 })
        .then((messages) =>
          messages
            .filter(
              (message) =>
                message.author.id === interaction.client.user.id &&
                message.embeds.length > 0,
            )
            .at(0),
        );

      if (walkthroughMessage) {
        await interaction.reply({
          content: `You cannot run the walkthrough command because a walkthrough already exists in this channel.\n(${walkthroughMessage.url})`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      // TODO: fix the fact that it looks weird when the resources message is sent as a reply
      await interaction.reply(resourcesMessage as InteractionReplyOptions);
    } else {
      await channel.send(resourcesMessage as MessageCreateOptions);
    }

    // Generate the walkthrough message asking the user what they're creating this issue for
    const message = generateQuestion(
      "What are you creating this issue for?",
      issueCategorySelector,
    );

    return channel.send(message);
  }
}

export default {
  data: new SlashCommandBuilder()
    .setName("walkthrough")
    .setDescription(
      "Sends the walkthrough message in case the bot didn't automatically send it.",
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const interactionChannel = (await interaction.client.channels.fetch(
      interaction.channelId,
    )) as GuildTextBasedChannel;

    return doWalkthrough(interactionChannel, interaction);
  },
};
