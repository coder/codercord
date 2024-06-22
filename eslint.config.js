// @ts-check

import path from "node:path";
import { fileURLToPath } from "node:url";

import eslint from "@eslint/js";
import { includeIgnoreFile } from "@eslint/compat";

import tseslint from "typescript-eslint";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default tseslint.config(
    eslint.configs.recommended,
    ...tseslint.configs.recommended,
    includeIgnoreFile(path.resolve(__dirname, ".gitignore")),
    includeIgnoreFile(path.resolve(__dirname, ".prettierignore")),
);
