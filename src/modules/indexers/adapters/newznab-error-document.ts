import { XMLParser } from "fast-xml-parser";

/**
 * Newznab reports API-level problems — expired keys, exhausted daily grab
 * quotas, disabled accounts — as an `<error>` document served with HTTP 200:
 *
 *   <error code="910" description="Request limit reached"/>
 *
 * Nothing downstream can tell that apart from a real answer by status code
 * alone, and both consumers previously misread it in the worst possible
 * direction: the search path saw "no items" and reported zero releases, while
 * the NZB path handed it to parseNzb and blamed the *release* for not being a
 * valid NZB. Detecting it here turns an indexer fault back into an indexer
 * fault.
 */

export type NewznabErrorDocument = {
    /** Newznab error code, when the document declares a numeric one. */
    code: number | null;
    description: string;
};

const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "",
    removeNSPrefix: true,
    textNodeName: "text",
    parseTagValue: false,
    parseAttributeValue: false,
});

/**
 * Error documents are tiny. Bounding the inspected prefix keeps this cheap on
 * the NZB path, where a legitimate body can be tens of megabytes.
 */
const maxInspectedBytes = 64 * 1024;

function asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : null;
}

function readErrorNode(node: unknown): NewznabErrorDocument | null {
    const record = asRecord(node);

    if (!record) {
        return null;
    }

    const description = typeof record.description === "string" ? record.description.trim() : "";
    const rawCode = typeof record.code === "string" ? record.code.trim() : "";
    const code = /^\d+$/.test(rawCode) ? Number(rawCode) : null;

    if (!description && code === null) {
        return null;
    }

    return { code, description: description || "The indexer reported an error." };
}

/** Formats a detected error for a user-facing failure message. */
export function formatNewznabErrorDocument(error: NewznabErrorDocument) {
    return error.code === null
        ? error.description
        : `Indexer error ${error.code}: ${error.description}`;
}

export function detectNewznabErrorDocument(body: string): NewznabErrorDocument | null {
    const sample = body.slice(0, maxInspectedBytes);
    const trimmed = sample.trimStart();

    if (!trimmed) {
        return null;
    }

    // A login page, WAF challenge, or reverse-proxy error page. Never a newznab
    // response, and never the release's fault.
    if (/^(?:<!doctype\s+html|<html[\s>])/i.test(trimmed)) {
        return {
            code: null,
            description: "The indexer returned an HTML page instead of a Newznab response.",
        };
    }

    // Cheap reject before parsing: valid RSS and NZB documents never carry an
    // `<error>` element, and this runs against multi-megabyte NZB bodies.
    if (!/<error[\s/>]/i.test(sample)) {
        return null;
    }

    let parsed: unknown;

    try {
        parsed = parser.parse(sample);
    } catch {
        return null;
    }

    const root = asRecord(parsed);

    if (!root) {
        return null;
    }

    // Bare `<error>` roots are the common shape; some indexers nest it inside
    // the RSS envelope they would otherwise have returned.
    return readErrorNode(root.error) ?? readErrorNode(asRecord(asRecord(root.rss)?.channel)?.error);
}
