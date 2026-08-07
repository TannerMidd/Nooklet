import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const siteDirectory = path.resolve("engineering-dossier");
const repositoryRoot = path.resolve(".");
const pagesBasePath = "/Nooklet/";
const requiredPages = ["index.html", "features/index.html", "guide/index.html"];
const sensitiveFilePattern =
    /(?:^\.env(?:\..+)?$|\.(?:db|db-wal|db-shm|sqlite|sqlite3|pem|key|p12|pfx|log|bak)$)/i;
const problems = [];
const files = new Set();
const directories = new Set([""]);

function displayPath(relativePath) {
    return relativePath || ".";
}

const namedEntities = new Map([
    ["amp", "&"],
    ["quot", '"'],
    ["apos", "'"],
    ["lt", "<"],
    ["gt", ">"],
]);

// A single pass over one combined pattern: the output of a replacement is
// never rescanned, so `&amp;quot;` decodes to the literal `&quot;` instead of
// being double-decoded to `"`.
function decodeHtmlAttribute(value) {
    return value.replace(
        /&(?:([a-z]+)|#x([0-9a-f]+)|#([0-9]+));/gi,
        (match, name, hexCode, decimalCode) => {
            if (name !== undefined) {
                return namedEntities.get(name.toLocaleLowerCase()) ?? match;
            }

            const codePoint = Number.parseInt(
                hexCode ?? decimalCode,
                hexCode !== undefined ? 16 : 10,
            );

            return Number.isInteger(codePoint) && codePoint <= 0x10ffff
                ? String.fromCodePoint(codePoint)
                : match;
        },
    );
}

function parseAttributes(tag) {
    const attributes = new Map();
    const pattern = /(?:^|\s)([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

    for (const match of tag.matchAll(pattern)) {
        const name = match[1].toLocaleLowerCase();
        const value = decodeHtmlAttribute(match[2] ?? match[3] ?? match[4] ?? "");

        if (!attributes.has(name)) {
            attributes.set(name, value);
        }
    }

    return attributes;
}

// Left-to-right scan matching the HTML tokenizer's comment handling: a
// comment runs from `<!--` to the first `-->` (or EOF). Each comment becomes
// a single space so removal can never splice surrounding text into a new
// apparent comment or tag.
function withoutComments(source) {
    let result = "";
    let index = 0;

    for (;;) {
        const start = source.indexOf("<!--", index);

        if (start === -1) {
            return result + source.slice(index);
        }

        result += `${source.slice(index, start)} `;
        const end = source.indexOf("-->", start + 4);

        if (end === -1) {
            return result;
        }

        index = end + 3;
    }
}

function collectDocumentFacts(source) {
    const markup = withoutComments(source);
    const ids = new Set();
    const duplicateIds = new Set();
    const links = [];
    const descriptions = [];

    for (const tagMatch of markup.matchAll(/<[a-z][^>]*>/gi)) {
        const tag = tagMatch[0];
        const tagName = /^<([a-z][\w:-]*)/i.exec(tag)?.[1]?.toLocaleLowerCase();
        const attributes = parseAttributes(tag);
        const id = attributes.get("id");

        if (id !== undefined) {
            if (id.length === 0) {
                problems.push("an element has an empty id attribute");
            } else if (ids.has(id)) {
                duplicateIds.add(id);
            } else {
                ids.add(id);
            }
        }

        for (const attribute of ["href", "src"]) {
            const value = attributes.get(attribute);

            if (value !== undefined && value.length > 0) {
                links.push({ attribute, tagName, value });
            }
        }

        if (tagName === "meta" && attributes.get("name")?.toLocaleLowerCase() === "description") {
            descriptions.push(attributes.get("content")?.trim() ?? "");
        }
    }

    const titles = [...markup.matchAll(/<title(?:\s[^>]*)?>([\s\S]*?)<\/title\s*>/gi)].map(
        (match) => match[1].replace(/<[^>]*>/g, "").trim(),
    );
    const h1Count = (markup.match(/<h1(?:\s[^>]*)?>/gi) ?? []).length;

    return {
        descriptions,
        duplicateIds,
        h1Count,
        ids,
        links,
        titles,
    };
}

function safeDecodeUriComponent(value, context) {
    try {
        return decodeURIComponent(value);
    } catch {
        problems.push(`${context}: URL contains invalid percent encoding`);

        return null;
    }
}

function resolveLocalTarget(sourceFile, rawValue) {
    const value = rawValue.trim();

    if (value.length === 0 || value.startsWith("//") || /^[a-z][a-z0-9+.-]*:/i.test(value)) {
        return null;
    }

    if (value.includes("\\")) {
        problems.push(`${sourceFile}: local URL '${value}' uses a backslash`);

        return null;
    }

    const hashIndex = value.indexOf("#");
    const beforeFragment = hashIndex === -1 ? value : value.slice(0, hashIndex);
    const rawFragment = hashIndex === -1 ? "" : value.slice(hashIndex + 1);
    const queryIndex = beforeFragment.indexOf("?");
    let rawPath = queryIndex === -1 ? beforeFragment : beforeFragment.slice(0, queryIndex);

    if (rawPath.startsWith("/")) {
        if (rawPath === pagesBasePath.slice(0, -1)) {
            rawPath = "";
        } else if (rawPath.startsWith(pagesBasePath)) {
            rawPath = rawPath.slice(pagesBasePath.length);
        } else {
            problems.push(
                `${sourceFile}: root-relative URL '${value}' is outside the Pages base path '${pagesBasePath}'`,
            );

            return null;
        }
    }

    const decodedPath = safeDecodeUriComponent(rawPath, `${sourceFile}: local URL '${value}'`);
    const fragment = safeDecodeUriComponent(rawFragment, `${sourceFile}: local URL '${value}'`);

    if (decodedPath === null || fragment === null) {
        return null;
    }

    const sourceDirectory = path.posix.dirname(sourceFile);
    let target =
        decodedPath.length === 0
            ? sourceFile
            : path.posix.normalize(path.posix.join(sourceDirectory, decodedPath));

    if (target === ".." || target.startsWith("../") || path.posix.isAbsolute(target)) {
        problems.push(`${sourceFile}: local URL '${value}' escapes the Pages artifact`);

        return null;
    }

    if (decodedPath.length > 0) {
        if (decodedPath.endsWith("/") || directories.has(target)) {
            target = path.posix.join(target, "index.html");
        }
    }

    return { fragment, target, value };
}

function resolveRepositorySourceTarget(rawValue) {
    let url;

    try {
        url = new URL(rawValue);
    } catch {
        return null;
    }

    const prefixes = ["/TannerMidd/Nooklet/blob/main/", "/TannerMidd/Nooklet/tree/main/"];
    const prefix = prefixes.find((candidate) => url.pathname.startsWith(candidate));

    if (url.hostname.toLocaleLowerCase() !== "github.com" || !prefix) {
        return null;
    }

    let repositoryPath;

    try {
        repositoryPath = decodeURIComponent(url.pathname.slice(prefix.length));
    } catch {
        return { error: "contains invalid percent encoding" };
    }

    const absoluteTarget = path.resolve(repositoryRoot, repositoryPath);
    const relativeTarget = path.relative(repositoryRoot, absoluteTarget);

    if (
        relativeTarget.length === 0 ||
        relativeTarget === ".." ||
        relativeTarget.startsWith(`..${path.sep}`) ||
        path.isAbsolute(relativeTarget)
    ) {
        return { error: "escapes the repository or names its root" };
    }

    return { absoluteTarget, repositoryPath };
}

async function scanArtifact(relativeDirectory = "") {
    const absoluteDirectory = path.join(
        siteDirectory,
        ...relativeDirectory.split("/").filter(Boolean),
    );
    let entries;

    try {
        entries = await readdir(absoluteDirectory, { withFileTypes: true });
    } catch (error) {
        if (error?.code === "ENOENT") {
            problems.push("engineering-dossier directory is missing");

            return;
        }

        throw error;
    }

    for (const entry of entries) {
        const relativePath = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name;

        if (entry.isSymbolicLink()) {
            problems.push(`${relativePath}: symlinks are not permitted in the Pages artifact`);
            continue;
        }

        if (entry.isDirectory()) {
            directories.add(relativePath);
            await scanArtifact(relativePath);
            continue;
        }

        if (!entry.isFile()) {
            problems.push(`${relativePath}: unsupported filesystem entry in the Pages artifact`);
            continue;
        }

        files.add(relativePath);

        if (sensitiveFilePattern.test(entry.name)) {
            problems.push(
                `${relativePath}: sensitive file type is not permitted in the Pages artifact`,
            );
        }
    }
}

await scanArtifact();

for (const requiredPage of requiredPages) {
    if (!files.has(requiredPage)) {
        problems.push(`${requiredPage}: required Pages document is missing`);
    }
}

const htmlFiles = [...files]
    .filter((file) => file.toLocaleLowerCase().endsWith(".html"))
    .sort((left, right) => left.localeCompare(right));
const documents = new Map();

for (const htmlFile of htmlFiles) {
    const source = await readFile(path.join(siteDirectory, ...htmlFile.split("/")), "utf8");
    const problemCountBeforeParsing = problems.length;
    const facts = collectDocumentFacts(source);

    for (let index = problemCountBeforeParsing; index < problems.length; index += 1) {
        problems[index] = `${htmlFile}: ${problems[index]}`;
    }

    if (facts.titles.length !== 1 || facts.titles[0]?.length === 0) {
        problems.push(`${htmlFile}: document must contain exactly one non-empty <title>`);
    }

    if (facts.descriptions.length !== 1 || facts.descriptions[0]?.length === 0) {
        problems.push(`${htmlFile}: document must contain exactly one non-empty meta description`);
    }

    if (facts.h1Count !== 1) {
        problems.push(
            `${htmlFile}: document must contain exactly one <h1> (found ${facts.h1Count})`,
        );
    }

    for (const duplicateId of facts.duplicateIds) {
        problems.push(`${htmlFile}: duplicate id '${duplicateId}'`);
    }

    documents.set(htmlFile, facts);
}

for (const [sourceFile, document] of documents) {
    for (const link of document.links) {
        const repositoryTarget = resolveRepositorySourceTarget(link.value);

        if (repositoryTarget?.error) {
            problems.push(
                `${sourceFile}: repository source link '${link.value}' ${repositoryTarget.error}`,
            );
        } else if (repositoryTarget) {
            try {
                await access(repositoryTarget.absoluteTarget);
            } catch {
                problems.push(
                    `${sourceFile}: repository source link '${link.value}' targets missing path '${repositoryTarget.repositoryPath}'`,
                );
            }
        }

        const resolved = resolveLocalTarget(sourceFile, link.value);

        if (resolved === null) {
            continue;
        }

        const { fragment, target, value } = resolved;

        if (!files.has(target)) {
            problems.push(
                `${sourceFile}: ${link.attribute} '${value}' does not resolve to a file (expected ${displayPath(target)})`,
            );
            continue;
        }

        if (fragment.length > 0 && target.toLocaleLowerCase().endsWith(".html")) {
            const targetDocument = documents.get(target);

            if (!targetDocument?.ids.has(fragment)) {
                problems.push(
                    `${sourceFile}: ${link.attribute} '${value}' references missing id '${fragment}' in ${target}`,
                );
            }
        }
    }
}

if (problems.length > 0) {
    console.error("Engineering dossier validation failed:\n");

    for (const problem of problems) {
        console.error(`- ${problem}`);
    }

    process.exitCode = 1;
} else {
    console.log(
        `Engineering dossier validation passed for ${htmlFiles.length} HTML documents and ${files.size} artifact files.`,
    );
}
