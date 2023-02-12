import "package:nyxx_interactions/nyxx_interactions.dart";

final Map<String, MultiselectOptionBuilder> platformOptions = {
  "linux": MultiselectOptionBuilder("Linux", "linux"),
  "windows": MultiselectOptionBuilder("Windows", "windows"),
  "macos": MultiselectOptionBuilder("macOS", "macos")
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
