import "dart:convert";

import "package:codercord/values.dart" show helpChannel;

import "package:nyxx/nyxx.dart";
import "package:nyxx_interactions/nyxx_interactions.dart";

bool canUserInteractWithThread(
    Cacheable<Snowflake, IMember> owner, IInteraction interaction) {
  return owner.id == interaction.userAuthor?.id ||
      interaction.memberAuthorPermissions!.manageThreads;
}

Snowflake getIdFromToken(String token) {
  return Snowflake(
    utf8.decode(
      base64.decode(
        base64.normalize(token.split(".")[0]),
      ),
    ),
  );
}

/*
  Extension used to fill in the lack of API for Forums in nyxx as of now

  Same idea as defining methods on an instantiated class' prototype in JS. e.g:

  String.prototype.hello = 1337;
  "".hello // is going to be 1337
*/

final cache = SnowflakeCache();

extension ForumExtension on IThreadChannel {
  Future<IThreadChannel> archive([bool archived = true, bool locked = false]) {
    ThreadBuilder threadBuilder = ThreadBuilder(name);
    threadBuilder.archived = archived;
    threadBuilder.locked = locked;

    return edit(threadBuilder);
  }

  Future<bool> get isHelpPost async {
    return await isForumPost && parentChannel!.id == helpChannel.id;
  }

  Future<bool> get isForumPost async {
    if (parentChannel != null) {
      return (await parentChannel!.getOrDownload()).channelType ==
          ChannelType.forumChannel;
    } else {
      throw Exception("No parent channel found.");
    }
  }

  Future<IHttpResponse> setPostTags(List<Snowflake> tags) async {
    Future<IHttpResponse> res = client.httpEndpoints.sendRawRequest(
      IHttpRoute()
        ..channels(
          id: id.id.toString(),
        ),
      "PATCH",
      auth: true,
      body: jsonEncode(
        {
          "applied_tags": tags
              .map(
                (e) => e.id.toString(),
              )
              .toList()
        },
      ),
      headers: {"Content-Type": "application/json"},
    );

    return res.then((value) {
      if (value.statusCode != 200) {
        throw Exception("Unsuccessful HTTP request");
      }

      return value;
    });
  }
}
