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

function withoutCodeFences(source) {
  return source.replace(/^```[\s\S]*?^```/gm, "");
}

function collectHeadingSlugs(source) {
  const slugs = new Set();
  const occurrences = new Map();

  for (const match of withoutCodeFences(source).matchAll(/^#{1,6}\s+(.+?)\s*#*\s*$/gm)) {
    const base = match[1]
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/<[^>]+>/g, "")
      .replace(/[`*_~]/g, "")
      .toLocaleLowerCase()
      .replace(/[^\p{Letter}\p{Number}\s-]/gu, "")
      .trim()
      .replace(/\s+/g, "-");
    const occurrence = occurrences.get(base) ?? 0;
    occurrences.set(base, occurrence + 1);
    slugs.add(occurrence === 0 ? base : `${base}-${occurrence}`);
  }

  return slugs;
}

for (const requiredFile of requiredFiles) {
  if (!fileSet.has(requiredFile)) {
    problems.push(`Missing required Wiki file: ${requiredFile}`);
  }
}

const sources = new Map(
  await Promise.all(
    files.map(async (file) => [file, await readFile(path.join(wikiDirectory, file), "utf8")]),
  ),
);
const headingsByPage = new Map(
  files.map((file) => [file.slice(0, -3), collectHeadingSlugs(sources.get(file))]),
);

for (const file of files) {
  const source = sources.get(file);
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

  const prose = withoutCodeFences(source);
  const linkPattern = /(?<!!)\[[^\]]*\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g;

  for (const match of prose.matchAll(linkPattern)) {
    const target = match[1];

    if (
      target.startsWith("https://") ||
      target.startsWith("http://") ||
      target.startsWith("mailto:")
    ) {
      continue;
    }

    if (!target.startsWith("#") && (target.startsWith("./") || target.startsWith("../") || target.includes("/"))) {
      problems.push(
        `${file}: repository-relative link '${target}' will not resolve from the separate Wiki repository`,
      );
      continue;
    }

    const [pageTarget, anchorTarget] = target.split("#", 2);
    const page = target.startsWith("#")
      ? file.slice(0, -3)
      : decodeURIComponent(pageTarget).replace(/\.md$/i, "");
    if (page && !pageSet.has(page)) {
      problems.push(`${file}: internal link '${target}' has no matching Wiki page`);
      continue;
    }

    const anchor = target.startsWith("#") ? target.slice(1) : anchorTarget;
    if (anchor && !headingsByPage.get(page)?.has(decodeURIComponent(anchor).toLocaleLowerCase())) {
      problems.push(`${file}: internal link '${target}' has no matching section`);
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
