import loadConfig from "@uwu/configmasher";

interface Config {
	token: string;
}

export const { config, layers } = await loadConfig<Config>({
	name: "Codercord",

	environmentFile: true,
	processEnvironment: true,

	caseInsensitive: true,

	defaults: {},
	mandatory: ["token"],
});
