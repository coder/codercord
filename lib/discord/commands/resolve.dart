import "package:codercord/config.dart";
import "package:codercord/discord/utils.dart";
import "package:nyxx/nyxx.dart";
import "package:nyxx_interactions/nyxx_interactions.dart";

// TODO: Use generalized handler for "resolve" and "unresolve"
SlashCommandBuilder getCommand() {
  return SlashCommandBuilder(
    "resolve",
    "Marks your post as resolved and archives it",
    [
      CommandOptionBuilder(
        CommandOptionType.boolean,
        "lock",
        "Whether to lock the post or not",
        channelTypes: [
          ChannelType.guildPublicThread,
          ChannelType.guildPrivateThread,
        ],
      )
    ],
    guild: Snowflake(config["coderServer"]["id"]),
    canBeUsedInDm: false,
  )..registerHandler((p0) async {
      await p0.acknowledge();

      final threadChannel =
          await p0.interaction.channel.download() as IThreadChannel;

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
              await threadChannel.archive(true, p0.args[0].value);
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
    });
}
