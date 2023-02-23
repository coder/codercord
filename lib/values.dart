import "package:codercord/config.dart";

import "package:nyxx/nyxx.dart";

late final IGuild coderServer;
late final IGuild emojiServer;

late final IGuildChannel helpChannel;

late final Snowflake closedTagID;
late final Snowflake openedTagID;

late final IBaseGuildEmoji coderEmoji;
late final IBaseGuildEmoji vscodeEmoji;

late final IBaseGuildEmoji linuxEmoji;
late final IBaseGuildEmoji windowsEmoji;
late final IBaseGuildEmoji macosEmoji;

Future<void> loadValues(INyxxWebsocket client) async {
  coderServer = await client.fetchGuild(Snowflake(config["coderServer"]["id"]),
      withCounts: false);

  helpChannel = await client.fetchChannel(
    Snowflake(config["helpChannel"]["id"]),
  );

  closedTagID = Snowflake(config["helpChannel"]["closedTag"]);
  openedTagID = Snowflake(config["helpChannel"]["openedTag"]);

  if (config["emojis"]["server"] != null) {
    emojiServer = await client.fetchGuild(
      Snowflake(config["emojis"]["server"]),
    );
  } else {
    emojiServer = coderServer;
  }

  coderEmoji = coderServer.emojis[Snowflake(config["emojis"]["coder"])]!;
  vscodeEmoji = coderServer.emojis[Snowflake(config["emojis"]["vscode"])]!;

  linuxEmoji = coderServer.emojis[Snowflake(config["emojis"]["linux"])]!;
  windowsEmoji = coderServer.emojis[Snowflake(config["emojis"]["windows"])]!;
  macosEmoji = coderServer.emojis[Snowflake(config["emojis"]["macos"])]!;
}
