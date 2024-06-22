# Codercord

A Discord bot for the Coder community server written in JavaScript.

## How to run

1. Get the [Dart SDK](https://dart.dev/get-dart)
2. Clone the repository

    ```sh
    git clone git@github.com:coder/codercord.git
    cd codercord
    ```

3. Run the project

    ```sh
    dart run
    ```

    You can also pre-compile the binary instead of using `dart run` everytime

    ```sh
    dart compile exe bin/codercord.dart -o codercord
    ./codercord
    ```

## Configuration

Environment variables :

- `CODERCORD_TOKEN` : The Discord bot's token
- `CODERCORD_TOML_PATH` : The path of the toml config file (default: config.toml)
   (relative to process working directory if no absolute path is provided)

Example `config.toml` provided [here](https://github.com/coder/codercord/blob/main/config.toml.example)
