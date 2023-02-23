import "package:codercord/discord/utils.dart";
import "package:codercord/values.dart";

import "package:nyxx/nyxx.dart";
import "package:nyxx_interactions/nyxx_interactions.dart";

final resolvedWords = {true: "resolved", false: "unresolved"};

Future<void> handleResolve(IThreadChannel threadChannel, IUser resolver,
    Function respond, bool resolve,
    [bool lock = false]) async {
  final resolvedWord = resolvedWords[resolve];

  final tagToAdd = resolve == true ? resolvedTagID : unresolvedTagID;
  final tagToRemove = resolve == true ? unresolvedTagID : resolvedTagID;

  final postTags = threadChannel.appliedTags;

  try {
    if (!postTags.contains(tagToAdd)) {
      postTags.add(tagToAdd);
    }

    if (postTags.contains(tagToRemove)) {
      postTags.remove(tagToRemove);
    }

    await threadChannel.setPostTags(postTags);

    await respond(
      MessageBuilder.content(
        "${resolver.mention} marked the thread as $resolvedWord.",
      )..flags = (MessageFlagBuilder()..suppressNotifications = true),
    );

    if (resolve == true && threadChannel.archived == false) {
      try {
        await threadChannel.archive(true, lock);
      } catch (_) {}
    }
  } catch (e) {
    await respond(
      MessageBuilder.content(
        "Could not mark the thread as $resolvedWord because of an unexpected error.",
      ),
      hidden: true,
    );
  }
}

Future<void> handleResolveCommand(
    ISlashCommandInteractionEvent p0, bool resolve,
    [bool lock = false]) async {
  final interactionChannel = await p0.interaction.channel.download();

  if (interactionChannel.channelType == ChannelType.guildPublicThread) {
    final threadChannel = interactionChannel as IThreadChannel;
    final resolvedWord = resolvedWords[resolve];

    if (await threadChannel.isHelpPost) {
      if (canUserInteractWithThread(threadChannel.owner, p0.interaction)) {
        return handleResolve(
          threadChannel,
          p0.interaction.userAuthor!,
          p0.respond,
          resolve,
        );
      } else {
        await p0.respond(
          MessageBuilder.content(
            "You cannot mark this thread as $resolvedWord since you are not the OP.",
          ),
          hidden: true,
        );
      }
    } else {
      await p0.respond(
        MessageBuilder.content(
          "Please run this command in a <#${helpChannel.id}> post.",
        ),
        hidden: true,
      );
    }
  } else {
    await p0.respond(
      MessageBuilder.content(
        "You can only run this command in a <#${helpChannel.id}> post.",
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
    guild: coderServer.id,
    canBeUsedInDm: false,
  )..registerHandler((p0) async {
      await handleResolveCommand(
        p0,
        true,
        p0.args.isNotEmpty ? p0.args[0].value : false,
      );
    });
}
