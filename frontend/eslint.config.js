import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
  globalIgnores([
    "dist",
    "node_modules",
  ]),

  {
    files: ["**/*.{js,jsx}"],

    extends: [
      js.configs.recommended,
      reactHooks.configs["recommended-latest"],
      reactRefresh.configs.vite,
    ],

    languageOptions: {
      ecmaVersion: "latest",

      globals: globals.browser,

      parserOptions: {
        ecmaVersion: "latest",

        ecmaFeatures: {
          jsx: true,
        },

        sourceType: "module",
      },
    },

    rules: {
      "no-unused-vars": [
        "error",
        {
          varsIgnorePattern: "^[A-Z_]",
          argsIgnorePattern: "^_",
        },
      ],

      semi: [
        "error",
        "always",
      ],

      quotes: [
        "error",
        "double",
        {
          avoidEscape: true,
          allowTemplateLiterals: true,
        },
      ],

      "comma-dangle": [
        "error",
        {
          arrays: "always-multiline",
          objects: "always-multiline",
          imports: "always-multiline",
          exports: "always-multiline",
          functions: "always-multiline",
        },
      ],

      "object-curly-spacing": [
        "error",
        "always",
      ],

      "array-bracket-spacing": [
        "error",
        "never",
      ],

      "comma-spacing": [
        "error",
        {
          before: false,
          after: true,
        },
      ],

      "key-spacing": [
        "error",
        {
          beforeColon: false,
          afterColon: true,
        },
      ],

      "keyword-spacing": [
        "error",
        {
          before: true,
          after: true,
        },
      ],

      "space-before-blocks": [
        "error",
        "always",
      ],

      "space-infix-ops": "error",

      "eol-last": [
        "error",
        "always",
      ],

      "no-multiple-empty-lines": [
        "error",
        {
          max: 1,
          maxEOF: 0,
        },
      ],

      "no-trailing-spaces": "error",

      "eqeqeq": [
        "error",
        "always",
      ],

      "curly": [
        "error",
        "all",
      ],
    },
  },
]);
