import "package:codercord/discord/interactions/commands/resolve.dart";
import "package:codercord/values.dart";

import "package:nyxx_interactions/nyxx_interactions.dart";

SlashCommandBuilder getCommand() {
  return SlashCommandBuilder(
    "unresolve",
    "Un-marks your post as resolved and un-archives it",
    [],
    guild: coderServer.id,
    canBeUsedInDm: false,
  )..registerHandler((p0) async {
      await handleResolveCommand(p0, false);
    });
}
