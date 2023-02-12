import "package:nyxx_interactions/nyxx_interactions.dart";

final Map<String, MultiselectOptionBuilder> categoryOptions = {
  "help": MultiselectOptionBuilder("Help needed", "help"),
  "bug": MultiselectOptionBuilder("Bug report", "bug"),
  "feature": MultiselectOptionBuilder("Feature request", "feature"),
  "other": MultiselectOptionBuilder("Other", "other")
};

final MultiselectBuilder categoryMultiSelect = MultiselectBuilder(
  "categoryMultiSelect",
  categoryOptions.values,
);

final ComponentRowBuilder categoryMultiSelectRow = ComponentRowBuilder()
  ..addComponent(categoryMultiSelect);

final ComponentMessageBuilder categoryMultiSelectMessage =
    ComponentMessageBuilder()
      ..addComponentRow(categoryMultiSelectRow)
      ..content = "What are you creating this issue for?";
