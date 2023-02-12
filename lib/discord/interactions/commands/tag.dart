import "dart:io";
import "dart:convert";

import "package:codercord/values.dart" show coderServer;

import "package:nyxx/nyxx.dart";
import "package:nyxx_interactions/nyxx_interactions.dart";

late Map<String, String> tags;
Future<List<ArgChoiceBuilder>> getTags() async {
  final tagsFile =
      File(Platform.environment["CODERCORD_TAGS_PATH"] ?? "tags.json");

  tags = await tagsFile
      .readAsString()
      .then((str) => jsonDecode(str))
      .then((data) => data.cast<String, String>());

  return tags.entries.map<ArgChoiceBuilder>((entry) {
    return ArgChoiceBuilder(entry.key, entry.key);
  }).toList();
}

SlashCommandBuilder getCommand(List<ArgChoiceBuilder> choiceBuilders) {
  return SlashCommandBuilder(
    "tag",
    "Sends the content of a tag",
    [
      CommandOptionBuilder(
        CommandOptionType.string,
        "name",
        "Name of the tag to get",
        //defaultArg: true,
        required: true,
        choices: choiceBuilders,
      ),
      CommandOptionBuilder(
        CommandOptionType.user,
        "user",
        "User to mention",
      )
    ],
    guild: coderServer.id,
    canBeUsedInDm: false,
  )..registerHandler((p0) async {
      String tagName = p0.args[0].value;
      String? tagText = tags[tagName];

      if (tagText != null) {
        if (p0.args.length > 1) {
          Snowflake userId = Snowflake(p0.args[1].value);

          tagText += " (<@${userId.id}>)";
        }

        await p0.respond(
          MessageBuilder.content(tagText),
        );
      } else {
        await p0.respond(
          MessageBuilder.content("No tag found with name $tagName."),
          hidden: true,
        );
      }
    });
}
