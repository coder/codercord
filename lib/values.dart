import "package:codercord/config.dart";

import "package:nyxx/nyxx.dart";

late final IGuild coderServer;
late final IGuild emojiServer;

late final IGuildChannel helpChannel;

late final Snowflake resolvedTagID;
late final Snowflake unresolvedTagID;

late final IBaseGuildEmoji coderEmoji;
late final IBaseGuildEmoji vscodeEmoji;

Future<void> loadValues(INyxxWebsocket client) async {
  coderServer = await client.fetchGuild(Snowflake(config["coderServer"]["id"]),
      withCounts: false);

  helpChannel = await client.fetchChannel(
    Snowflake(config["helpChannel"]["id"]),
  );

  resolvedTagID = Snowflake(config["helpChannel"]["resolvedTag"]);
  unresolvedTagID = Snowflake(config["helpChannel"]["unresolvedTag"]);

  if (config["emojis"]["server"] != null) {
    emojiServer = await client.fetchGuild(
      Snowflake(config["emojis"]["server"]),
    );
  } else {
    emojiServer = coderServer;
  }

  coderEmoji = coderServer.emojis[Snowflake(config["emojis"]["coder"])]!;
  vscodeEmoji = coderServer.emojis[Snowflake(config["emojis"]["vscode"])]!;
}
