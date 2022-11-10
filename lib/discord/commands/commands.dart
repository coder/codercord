import "package:nyxx_interactions/nyxx_interactions.dart";

import "tag.dart" as command_tag show getCommand, getTags;
import "resolve.dart" as command_resolve show getCommand;
import "unresolve.dart" as command_unresolve show getCommand;

Future<List<SlashCommandBuilder>> getSlashCommands() async {
  return [
    command_tag.getCommand(await command_tag.getTags()),
    command_resolve.getCommand(),
    command_unresolve.getCommand(),
  ];
}
