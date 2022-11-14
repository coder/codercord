import "package:codercord/config.dart";
import "package:codercord/discord/utils.dart";

import "package:nyxx/nyxx.dart";
import "package:nyxx_interactions/nyxx_interactions.dart";

Snowflake resolvedTag = Snowflake(config["helpChannel"]["resolvedTag"]);

Future<void> handleResolve(ISlashCommandInteractionEvent p0, bool resolve,
    [bool lock = false]) async {
  //await p0.acknowledge();

  final resolvedWord = resolve == true ? "resolved" : "unresolved";

  final threadChannel =
      await p0.interaction.channel.download() as IThreadChannel;

  if (threadChannel.channelType == ChannelType.guildPublicThread) {
    if (canUserInteractWithThread(threadChannel.owner, p0.interaction)) {
      if (config["helpChannel"]["id"] ==
              threadChannel.parentChannel?.id.id.toString() &&
          await threadChannel.isForumPost) {
        final postTags = threadChannel.appliedTags;

        try {
          if (resolve == true) {
            if (!postTags.contains(resolvedTag)) {
              await threadChannel.setPostTags(
                postTags..add(resolvedTag),
              );
            }

            await p0.respond(
              MessageBuilder.content("Marked the thread as $resolvedWord."),
              hidden: true,
            );

            if (threadChannel.archived == false) {
              try {
                await threadChannel.archive(true, lock);
              } catch (_) {
                await p0.respond(
                  MessageBuilder.content("Failed to archive the thread."),
                  hidden: true,
                );
              }
            }
          } else {
            if (threadChannel.archived == true) {
              await threadChannel.archive(false);
            }

            if (postTags.contains(resolvedTag)) {
              await threadChannel.setPostTags(
                postTags
                  ..removeWhere(
                    (e) => e == resolvedTag,
                  ),
              );
            }

            await p0.respond(
              MessageBuilder.content("Marked the thread as $resolvedWord."),
              hidden: true,
            );
          }
        } catch (e) {
          await p0.respond(
            MessageBuilder.content(
                "Could not mark the thread as $resolvedWord because of an unexpected error."),
            hidden: true,
          );
        }
      }
    } else {
      p0.respond(
        MessageBuilder.content(
          "You cannot mark this thread as $resolvedWord since you are not the OP.",
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
}

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
      await handleResolve(
        p0,
        true,
        p0.args.isNotEmpty ? p0.args[0].value : false,
      );
    });
}
