import stylistic from "@stylistic/eslint-plugin";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";

const eslintConfig = [
    {
        ignores: [".codex-tmp/**", "playwright-report/**", "test-results/**"],
    },
    ...nextCoreWebVitals,
    ...nextTypeScript,
    prettier,
    {
        files: ["**/*.{js,mjs,cjs,jsx,ts,tsx}"],
        plugins: {
            "@stylistic": stylistic,
        },
        rules: {
            curly: ["error", "all"],
            "@stylistic/padding-line-between-statements": [
                "error",
                { blankLine: "always", prev: "directive", next: "*" },
                { blankLine: "any", prev: "directive", next: "directive" },
                { blankLine: "always", prev: ["const", "let", "var"], next: "*" },
                {
                    blankLine: "any",
                    prev: ["const", "let", "var"],
                    next: ["const", "let", "var"],
                },
                {
                    blankLine: "always",
                    prev: "*",
                    next: ["block-like", "return", "throw"],
                },
                { blankLine: "always", prev: "block-like", next: "*" },
            ],
        },
    },
];

export default eslintConfig;
