import js from "@eslint/js";
import globals from "globals";

export default [
  {
    ignores: ["dist/**", "node_modules/**", "icons/**"]
  },
  js.configs.recommended,
  {
    files: ["**/*.js", "**/*.mjs"],
    languageOptions: {
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.webextensions,
        chrome: "readonly"
      }
    },
    rules: {
      "no-control-regex": "off",
      "no-unused-vars": ["warn", { "argsIgnorePattern": "^_" }]
    }
  }
];
