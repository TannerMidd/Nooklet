import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const repositoryRoot = path.resolve(".");
const publishedRoots = [
  path.resolve("README.md"),
  path.resolve("docs"),
  path.resolve("engineering-dossier"),
];
const publishedExtensions = new Set([".html", ".js", ".md"]);
const retiredDownloaderPattern = /\bSAB(?:nzbd)?\b|SABNZBD_/giu;
const problems = [];

async function collectPublishedFiles(target, collected = []) {
  const entries = await readdir(target, { withFileTypes: true }).catch((error) => {
    if (error?.code === "ENOTDIR") return null;
    throw error;
  });

  if (entries === null) {
    if (publishedExtensions.has(path.extname(target).toLocaleLowerCase())) {
      collected.push(target);
    }
    return collected;
  }

  for (const entry of entries) {
    const child = path.join(target, entry.name);
    if (entry.isDirectory()) {
      await collectPublishedFiles(child, collected);
    } else if (
      entry.isFile()
      && publishedExtensions.has(path.extname(entry.name).toLocaleLowerCase())
    ) {
      collected.push(child);
    }
  }

  return collected;
}

function displayPath(absolutePath) {
  return path.relative(repositoryRoot, absolutePath).split(path.sep).join("/");
}

function lineNumberAt(source, index) {
  return source.slice(0, index).split("\n").length;
}

function collectGitHubSourceUrls(source) {
  const urls = new Map();
  const patterns = [
    /(?:href|src)=["'](https:\/\/github\.com\/TannerMidd\/Nooklet\/(?:blob|tree)\/main\/[^"']+)["']/giu,
    /\]\((https:\/\/github\.com\/TannerMidd\/Nooklet\/(?:blob|tree)\/main\/(?:[^\s()]|\([^()\s]*\))+?)\)/giu,
  ];

  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const url = match[1];
      const offset = (match.index ?? 0) + match[0].indexOf(url);
      if (!urls.has(url)) urls.set(url, offset);
    }
  }

  return urls;
}

function collectLocalMarkdownTargets(source) {
  const targets = [];
  const pattern = /!?\[[^\]]*\]\((?:<([^>]+)>|((?:[^\s()]|\([^()\s]*\))+?))(?:\s+["'][^"']*["'])?\)/gu;

  for (const match of source.matchAll(pattern)) {
    const target = match[1] ?? match[2];
    if (
      target.startsWith("#")
      || target.startsWith("//")
      || /^[a-z][a-z0-9+.-]*:/iu.test(target)
    ) {
      continue;
    }
    targets.push({ offset: match.index ?? 0, target });
  }

  return targets;
}

function resolveRepositoryTarget(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return { error: "is not a valid URL" };
  }

  const prefixes = [
    "/TannerMidd/Nooklet/blob/main/",
    "/TannerMidd/Nooklet/tree/main/",
  ];
  const prefix = prefixes.find((candidate) => url.pathname.startsWith(candidate));
  if (!prefix) return { error: "does not name a main-branch source path" };

  let repositoryPath;
  try {
    repositoryPath = decodeURIComponent(url.pathname.slice(prefix.length));
  } catch {
    return { error: "contains invalid percent encoding" };
  }

  const absoluteTarget = path.resolve(repositoryRoot, repositoryPath);
  const relativeTarget = path.relative(repositoryRoot, absoluteTarget);
  if (
    relativeTarget.length === 0
    || relativeTarget === ".."
    || relativeTarget.startsWith(`..${path.sep}`)
    || path.isAbsolute(relativeTarget)
  ) {
    return { error: "escapes the repository or names its root" };
  }

  return { absoluteTarget, repositoryPath };
}

const files = (
  await Promise.all(publishedRoots.map((root) => collectPublishedFiles(root)))
).flat().sort((left, right) => left.localeCompare(right));
let sourceLinkCount = 0;

for (const file of files) {
  const source = await readFile(file, "utf8");
  const relativeFile = displayPath(file);

  for (const match of source.matchAll(retiredDownloaderPattern)) {
    problems.push(
      `${relativeFile}:${lineNumberAt(source, match.index ?? 0)}: retired external-downloader term '${match[0]}' remains in published content`,
    );
  }

  for (const [rawUrl, offset] of collectGitHubSourceUrls(source)) {
    sourceLinkCount += 1;
    const target = resolveRepositoryTarget(rawUrl);
    if (target.error) {
      problems.push(
        `${relativeFile}:${lineNumberAt(source, offset)}: source link '${rawUrl}' ${target.error}`,
      );
      continue;
    }

    try {
      await access(target.absoluteTarget);
    } catch {
      problems.push(
        `${relativeFile}:${lineNumberAt(source, offset)}: source link '${rawUrl}' targets missing path '${target.repositoryPath}'`,
      );
    }
  }

  if (
    path.extname(file).toLocaleLowerCase() === ".md"
    && !relativeFile.startsWith("docs/wiki/")
  ) {
    for (const { offset, target } of collectLocalMarkdownTargets(source)) {
      const [rawPath] = target.split(/[?#]/u, 1);
      let decodedPath;
      try {
        decodedPath = decodeURIComponent(rawPath);
      } catch {
        problems.push(
          `${relativeFile}:${lineNumberAt(source, offset)}: local link '${target}' contains invalid percent encoding`,
        );
        continue;
      }

      const absoluteTarget = path.resolve(path.dirname(file), decodedPath);
      const relativeTarget = path.relative(repositoryRoot, absoluteTarget);
      if (
        relativeTarget === ".."
        || relativeTarget.startsWith(`..${path.sep}`)
        || path.isAbsolute(relativeTarget)
      ) {
        problems.push(
          `${relativeFile}:${lineNumberAt(source, offset)}: local link '${target}' escapes the repository`,
        );
        continue;
      }

      try {
        await access(absoluteTarget);
      } catch {
        problems.push(
          `${relativeFile}:${lineNumberAt(source, offset)}: local link '${target}' targets missing path '${displayPath(absoluteTarget)}'`,
        );
      }
    }
  }
}

if (problems.length > 0) {
  console.error("Published documentation validation failed:\n");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exitCode = 1;
} else {
  console.log(
    `Published documentation validation passed for ${files.length} files and ${sourceLinkCount} current-main source links.`,
  );
}
