import "package:codercord/discord/interactions/commands/close.dart";
import "package:codercord/values.dart";

import "package:nyxx_interactions/nyxx_interactions.dart";

SlashCommandBuilder getCommand() {
  return SlashCommandBuilder(
    "reopen",
    "Reopens your post",
    [],
    guild: coderServer.id,
    canBeUsedInDm: false,
  )..registerHandler((p0) async {
      await handleIssueStateCommand(p0, false);
    });
}
