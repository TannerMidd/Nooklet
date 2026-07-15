import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const wikiDirectory = path.resolve("docs/wiki");
const requiredFiles = ["Home.md", "_Sidebar.md", "_Footer.md"];
const files = (await readdir(wikiDirectory))
  .filter((file) => file.endsWith(".md"))
  .sort((left, right) => left.localeCompare(right));
const fileSet = new Set(files);
const pageSet = new Set(files.map((file) => file.slice(0, -3)));
const problems = [];

for (const requiredFile of requiredFiles) {
  if (!fileSet.has(requiredFile)) {
    problems.push(`Missing required Wiki file: ${requiredFile}`);
  }
}

for (const file of files) {
  const source = await readFile(path.join(wikiDirectory, file), "utf8");
  const fenceCount = (source.match(/^```/gm) ?? []).length;

  if (source.trim().length === 0) {
    problems.push(`${file}: file is empty`);
  }

  if (fenceCount % 2 !== 0) {
    problems.push(`${file}: unbalanced fenced code block`);
  }

  if (!file.startsWith("_") && !/^#\s+\S/m.test(source)) {
    problems.push(`${file}: page needs a level-one heading`);
  }

  const prose = source.replace(/^```[\s\S]*?^```/gm, "");
  const linkPattern = /(?<!!)\[[^\]]*\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g;

  for (const match of prose.matchAll(linkPattern)) {
    const target = match[1];

    if (
      target.startsWith("#") ||
      target.startsWith("https://") ||
      target.startsWith("http://") ||
      target.startsWith("mailto:")
    ) {
      continue;
    }

    if (target.startsWith("./") || target.startsWith("../") || target.includes("/")) {
      problems.push(
        `${file}: repository-relative link '${target}' will not resolve from the separate Wiki repository`,
      );
      continue;
    }

    const page = decodeURIComponent(target.split("#", 1)[0]).replace(/\.md$/i, "");
    if (page && !pageSet.has(page)) {
      problems.push(`${file}: internal link '${target}' has no matching Wiki page`);
    }
  }
}

if (problems.length > 0) {
  console.error("Wiki validation failed:\n");
  for (const problem of problems) {
    console.error(`- ${problem}`);
  }
  process.exitCode = 1;
} else {
  console.log(`Wiki validation passed for ${files.length} Markdown files.`);
}
