import "package:codercord/config.dart";
import "package:codercord/discord/utils.dart";

import "package:nyxx/nyxx.dart";
import "package:nyxx_interactions/nyxx_interactions.dart";

Future<void> handleResolve(ISlashCommandInteractionEvent p0, bool resolve,
    [bool lock = false]) async {
  final interactionChannel = await p0.interaction.channel.download();

  if (interactionChannel.channelType == ChannelType.guildPublicThread) {
    final resolvedWord = resolve == true ? "resolved" : "unresolved";

    final threadChannel = interactionChannel as IThreadChannel;

    if (await threadChannel.isHelpPost) {
      if (canUserInteractWithThread(threadChannel.owner, p0.interaction)) {
        final tagToAdd = resolve == true ? resolvedTag : unresolvedTag;
        final tagToRemove = resolve == true ? unresolvedTag : resolvedTag;

        final postTags = threadChannel.appliedTags;

        try {
          if (!postTags.contains(tagToAdd)) {
            postTags.add(tagToAdd);
          }

          if (postTags.contains(tagToRemove)) {
            postTags.remove(tagToRemove);
          }

          await threadChannel.setPostTags(postTags);

          await p0.respond(
            MessageBuilder.content("Marked the thread as $resolvedWord."),
            hidden: true,
          );

          if (resolve == true && threadChannel.archived == false) {
            try {
              await threadChannel.archive(true, lock);
            } catch (_) {}
          }
        } catch (e) {
          await p0.respond(
            MessageBuilder.content(
              "Could not mark the thread as $resolvedWord because of an unexpected error.",
            ),
            hidden: true,
          );
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
          "Please run this command in a <#${config["helpChannel"]["id"]}> post.",
        ),
        hidden: true,
      );
    }
  } else {
    p0.respond(
      MessageBuilder.content(
        "You can only run this command in a <#${config["helpChannel"]["id"]}> post.",
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
