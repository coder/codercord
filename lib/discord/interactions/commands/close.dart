import "package:codercord/discord/utils.dart";
import "package:codercord/values.dart";

import "package:nyxx/nyxx.dart";
import "package:nyxx_interactions/nyxx_interactions.dart";

final stateVerbs = {
  true: "close",
  false: "reopen",
};

final stateWords = {
  true: "closed",
  false: "reopened",
};

Future<void> handleIssueState(
    IThreadChannel threadChannel, IUser closer, Function respond, bool close,
    [bool lock = false]) async {
  final stateWord = stateWords[close];
  final stateVerb = stateVerbs[close];

  final tagToAdd = close == true ? closedTagID : openedTagID;
  final tagToRemove = close == true ? openedTagID : closedTagID;

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
        "${closer.mention} $stateWord ${lock == true ? "and locked " : ""}the thread.",
      )..flags = (MessageFlagBuilder()..suppressNotifications = true),
    );

    if (close == true && threadChannel.archived == false) {
      try {
        await threadChannel.archive(true, lock);
      } catch (_) {}
    }
  } catch (e) {
    await respond(
      MessageBuilder.content(
        "Could not $stateVerb the thread because of an unexpected error.",
      ),
      hidden: true,
    );
  }
}

Future<void> handleIssueStateCommand(
    ISlashCommandInteractionEvent p0, bool close,
    [bool lock = false]) async {
  final interactionChannel = await p0.interaction.channel.download();

  if (interactionChannel.channelType == ChannelType.guildPublicThread) {
    final threadChannel = interactionChannel as IThreadChannel;
    final stateVerb = stateVerbs[close];

    if (await threadChannel.isHelpPost) {
      if (canUserInteractWithThread(threadChannel.owner, p0.interaction)) {
        return handleIssueState(
          threadChannel,
          p0.interaction.userAuthor!,
          p0.respond,
          close,
          lock,
        );
      } else {
        await p0.respond(
          MessageBuilder.content(
            "You cannot $stateVerb this thread since you are not the OP.",
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
    "close",
    "Closes your post",
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
      await handleIssueStateCommand(
        p0,
        true,
        p0.args.isNotEmpty ? p0.args[0].value : false,
      );
    });
}
