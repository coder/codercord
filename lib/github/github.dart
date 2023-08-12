import "package:version/version.dart";
import "package:github/github.dart";

import "package:nyxx_interactions/nyxx_interactions.dart";
import "package:nyxx/nyxx.dart";

final GitHub github = GitHub();

Future<Release> getNewestRelease(RepositorySlug slug) {
  return github.repositories.listReleases(slug).first;
}

Future<List<Release>> getNewerReleases(
  RepositorySlug slug,
  Version version,
) async {
  Stream<Release> releaseStream =
      github.repositories.listReleases(slug).takeWhile(
    (release) {
      Version releaseVersion = Version.parse(
        release.tagName!.replaceFirst("v", ""),
      );

      return releaseVersion > version;
    },
  );

  return releaseStream.toList();
}

Future<ComponentMessageBuilder> makeReleaseMessage(
  RepositorySlug slug,
  Release release,
) async {
  EmbedBuilder embed = EmbedBuilder()
    ..title = "New release published ! :tada:"
    ..addField(
      name: "Repository",
      content: "[${slug.fullName}](https://github.com/${slug.fullName})",
      inline: true,
    )
    ..addField(
      name: "Version",
      content: "[${release.tagName!}](${release.htmlUrl!})",
      inline: true,
    );

  ComponentMessageBuilder message = ComponentMessageBuilder()
    ..componentRows = [
      ComponentRowBuilder()
        ..addComponent(
          LinkButtonBuilder("Changelog", release.htmlUrl!),
        )
    ]
    ..embeds = [embed];

  return message;
}
