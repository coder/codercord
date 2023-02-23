import "package:codercord/values.dart";
import "package:nyxx_interactions/nyxx_interactions.dart";

final Map<String, MultiselectOptionBuilder> platformOptions = {
  "linux": MultiselectOptionBuilder("Linux", "linux")..emoji = linuxEmoji,
  "windows": MultiselectOptionBuilder("Windows", "windows")
    ..emoji = windowsEmoji,
  "macos": MultiselectOptionBuilder("macOS", "macos")..emoji = macosEmoji
};

final MultiselectBuilder platformMultiSelect = MultiselectBuilder(
  "platformMultiSelect",
  platformOptions.values,
);

final ComponentRowBuilder platformMultiSelectRow = ComponentRowBuilder()
  ..addComponent(platformMultiSelect);

final ComponentMessageBuilder platformMultiSelectMessage =
    ComponentMessageBuilder()
      ..addComponentRow(platformMultiSelectRow)
      ..content = "What platform are you using?";
