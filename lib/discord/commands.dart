import "package:nyxx/nyxx.dart";
import "package:nyxx_interactions/nyxx_interactions.dart";

import "package:codercord/config.dart" show config;
import "package:codercord/discord/utils.dart";

// TODO: Use generalized handler for "resolve" and "unresolve"
final List<SlashCommandBuilder> slashCommands = [
  SlashCommandBuilder(
    "resolve",
    "Marks your post as resolved and archives it",
    [],
    guild: Snowflake(config["coderServer"]["id"]),
    canBeUsedInDm: false,
  )..registerHandler((p0) async {
      final threadChannel =
          await p0.interaction.channel.getOrDownload() as IThreadChannel;

      if (threadChannel.channelType == ChannelType.guildPublicThread) {
        if (canUserInteractWithThread(threadChannel.owner, p0.interaction)) {
          // only attempt to add the tag if in the help forum channel
          if (config["helpChannel"]["id"] ==
                  threadChannel.parentChannel?.id.id.toString() &&
              await threadChannel.isForumPost) {
            final postTags =
                await threadChannel.appliedTags; // async getters, I know

            if (!postTags.contains(config["helpChannel"]["resolvedTag"])) {
              try {
                await threadChannel.setPostTags(
                  postTags..add(config["helpChannel"]["resolvedTag"]),
                );

                await p0.respond(
                  MessageBuilder.content("Marked the thread as resolved."),
                  hidden: true,
                );
              } catch (e) {
                await p0.respond(
                  MessageBuilder.content(
                      "Could not mark the thread as resolved because of an unexpected error."),
                  hidden: true,
                );
              }
            } else {
              await p0.respond(
                MessageBuilder.content("Thread is already resolved."),
                hidden: true,
              );
            }
          }

          if (!threadChannel.archived) {
            try {
              await threadChannel.archive();
            } catch (_) {}
          }
        } else {
          p0.respond(
            MessageBuilder.content(
              "You cannot resolve the thread since you are not the OP.",
            ),
            hidden: true,
          );
        }
      } else {
        p0.respond(
          MessageBuilder.content(
            "You can only run this command in a thread/forum post.",
          ),
          hidden: true,
        );
      }
    }),
  SlashCommandBuilder(
    "unresolve",
    "Un-marks your post as resolved and un-archives it",
    [],
    guild: Snowflake(config["coderServer"]["id"]),
    canBeUsedInDm: false,
  )..registerHandler((p0) async {
      final threadChannel =
          await p0.interaction.channel.getOrDownload() as IThreadChannel;

      if (threadChannel.channelType == ChannelType.guildPublicThread) {
        if (canUserInteractWithThread(threadChannel.owner, p0.interaction)) {
          if (config["helpChannel"]["id"] ==
                  threadChannel.parentChannel?.id.id.toString() &&
              await threadChannel.isForumPost) {
            final postTags = await threadChannel.appliedTags;

            if (postTags.contains(config["helpChannel"]["resolvedTag"])) {
              try {
                await threadChannel.setPostTags(
                  postTags
                    ..removeWhere(
                        (e) => e == config["helpChannel"]["resolvedTag"]),
                );

                await p0.respond(
                  MessageBuilder.content("Marked the thread as unresolved."),
                  hidden: true,
                );
              } catch (e) {
                await p0.respond(
                  MessageBuilder.content(
                      "Could not mark the thread as unresolved because of an unexpected error."),
                  hidden: true,
                );
              }
            } else {
              await p0.respond(
                MessageBuilder.content("Thread is already unresolved."),
                hidden: true,
              );
            }
          }

          if (!threadChannel.archived) {
            try {
              await threadChannel.archive(false);
            } catch (_) {}
          }
        } else {
          p0.respond(
            MessageBuilder.content(
              "You cannot mark this thread as unresolved since you are not the OP.",
            ),
            hidden: true,
          );
        }
      } else {
        p0.respond(
          MessageBuilder.content(
            "You can only run this command in a thread/forum post.",
          ),
          hidden: true,
        );
      }
    })
];
