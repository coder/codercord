import "package:codercord/discord/components/category_multi_select.dart";
import "package:codercord/discord/interactions/commands/close.dart";
import "package:codercord/discord/utils.dart";
import "package:codercord/values.dart";

import "package:nyxx/nyxx.dart";

import "package:nyxx_interactions/nyxx_interactions.dart";

SlashCommandBuilder getCommand() {
  return SlashCommandBuilder(
    "walkthrough",
    "Sends the walkthrough message in case the bot didn't send it",
    [],
    guild: coderServer.id,
    canBeUsedInDm: false,
  )..registerHandler((p0) async {
      final interactionChannel = await p0.interaction.channel.getOrDownload();

      if (interactionChannel.channelType == ChannelType.guildPublicThread) {
        final threadChannel = interactionChannel as IThreadChannel;

        if (await threadChannel.isHelpPost) {
          if (threadChannel.appliedTags.isEmpty) {
            await threadChannel.setPostTags([openedTagID]);
          }

          final channelMessages = threadChannel.downloadMessages(
            limit: 10,
            around: Snowflake.fromDateTime(threadChannel.createdAt),
          );

          try {
            IMessage walkthroughMessage = await channelMessages.firstWhere(
              (message) =>
                  message.author.id == (p0.client as INyxxWebsocket).self.id &&
                  (message.components.isNotEmpty || message.embeds.isNotEmpty),
            );

            await p0.respond(
                MessageBuilder.content(
                  "You cannot run the walkthrough again because a walkthrough already exists in this channel\n(${walkthroughMessage.url})",
                ),
                hidden: true);
          } on StateError catch (_) {
            p0.respond(categoryMultiSelectMessage);
          }
        }
      }
    });
}
