# Nooklet product and engineering site

This directory is the source artifact for Nooklet's public GitHub Pages site. It
is a dependency-free, multi-page static experience designed to deploy beneath the
repository's GitHub Pages project path.

## Published sections

- `index.html` is the source-backed technical architecture dossier.
- `architecture/index.html` is the code-path breakdown reference: twelve
  self-contained traces, each one inline-SVG diagram plus prose plus links to the
  files that own the step.
- `features/index.html` is the product capability and fit guide.
- `guide/index.html` is the curated, task-oriented user guide.

The dossier states boundaries and quality attributes; the code-path reference walks
the implementation and names files. Where the two disagree with a decision record,
the code-path page records the disagreement rather than smoothing it over.

The user guide includes a local-only, one-paste Docker setup generator and links
to the GitHub Wiki for canonical, platform-specific runbooks. It does not
duplicate the full operator handbook.

The document is an implementation-backed architecture baseline rather than a
product overview. Its figures cover system context, dependency direction,
request sequencing, state transitions, capacity policy, data relationships,
schema composition, migration history, worker leasing, trust boundaries,
deployment topology, module distribution, and release evidence. Tables record
failure semantics, control coverage, limitations, and requirement-to-source
traceability.

Architecture statements should link to the owning source, workflow, schema,
migration, ADR, test, or workflow definition. Counts and timings must be derived
from the repository at the published baseline; do not present inferred or
aspirational behavior as observed runtime behavior.

## Breakdown diagrams

Diagrams on `architecture/index.html` are hand-authored inline SVG. Three rules keep
them inside the validator's contract, and all three fail the build if broken:

- No `id` attribute may appear inside an `<svg>`. Arrowheads are inline `<path>`
  triangles rather than shared `<marker>` definitions, because the validator rejects
  duplicate ids document-wide and fourteen diagrams would collide.
- No `<title>` element may appear inside an `<svg>`. The validator counts `<title>`
  across the whole document and requires exactly one. Accessible names come from
  `role="img"` with `aria-labelledby` pointing at the figure's visible heading, and
  `aria-describedby` pointing at a visually hidden linearization.
- No `>` may appear inside an attribute value; write it as text content or `&gt;`.

Paint and type live in CSS classes in `styles.css`, never in presentation attributes:
`fill="var(--teal)"` does not work in any browser, and would silently render black.
Only geometry belongs in the markup. The canonical viewBox width is 930 to match the
rail layout's document column, so diagrams render at roughly 1:1 rather than scaling
down into unreadable type.

## Local preview

Serve `engineering-dossier` as the web root and open `/`, `/features/`, or
`/guide/`. The site intentionally uses only project-relative asset paths, makes
no runtime third-party requests, and does not require a build step.

Run `npm run docs:dossier:check` from the repository root before publication.
The dependency-free validators check required pages, local files and fragments,
document metadata, heading structure, duplicate IDs, symlinks, sensitive
artifact types, path safety, secret generation, and generated setup commands.

## Publication

`.github/workflows/engineering-dossier-pages.yml` validates this directory,
uploads it as the exact Pages artifact, and deploys it from `main`. The Pages
source for the repository must be set to **GitHub Actions**.

## Public-data policy

Do not add private signed-in screenshots, environment files, database files,
private paths, account details, service endpoints, API keys, queue payloads, or
media history. Product screenshots must be intentionally sanitized public
assets. Examples should use generic container paths such as
`/downloads/nooklet-engine` and `/media/movies`.
