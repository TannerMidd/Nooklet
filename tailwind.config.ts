import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{ts,tsx,mdx}",
    "./src/components/**/*.{ts,tsx,mdx}",
    "./src/config/**/*.{ts,tsx}",
    "./src/lib/**/*.{ts,tsx}",
    "./src/modules/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "rgb(var(--background) / <alpha-value>)",
        foreground: "rgb(var(--foreground) / <alpha-value>)",
        panel: "rgb(var(--panel) / <alpha-value>)",
        "panel-strong": "rgb(var(--panel-strong) / <alpha-value>)",
        "panel-raised": "rgb(var(--panel-raised) / <alpha-value>)",
        muted: "rgb(var(--muted) / <alpha-value>)",
        line: "rgb(var(--line) / <alpha-value>)",
        accent: "rgb(var(--accent) / <alpha-value>)",
        "accent-strong": "rgb(var(--accent-strong) / <alpha-value>)",
        "accent-foreground": "rgb(var(--accent-foreground) / <alpha-value>)",
        "accent-cool": "rgb(var(--accent-cool) / <alpha-value>)",
        "accent-cool-foreground": "rgb(var(--accent-cool-foreground) / <alpha-value>)",
        "accent-wine": "rgb(var(--accent-wine) / <alpha-value>)",
        highlight: "rgb(var(--highlight) / <alpha-value>)",
      },
      fontFamily: {
        heading: ["var(--font-heading)", "sans-serif"],
        body: ["var(--font-body)", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
