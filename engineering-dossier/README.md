# Nooklet product and engineering site

This directory is the source artifact for Nooklet's public GitHub Pages site. It
is a dependency-free, multi-page static experience designed to deploy beneath the
repository's GitHub Pages project path.

## Published sections

- `index.html` is the source-backed technical architecture dossier.
- `features/index.html` is the product capability and fit guide.
- `guide/index.html` is the curated, task-oriented user guide.

The user guide orients readers and links to the GitHub Wiki for canonical,
platform-specific runbooks. It does not duplicate the full operator handbook.

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

## Local preview

Serve `engineering-dossier` as the web root and open `/`, `/features/`, or
`/guide/`. The site intentionally uses only project-relative asset paths, makes
no runtime third-party requests, and does not require a build step.

Run `npm run docs:dossier:check` from the repository root before publication.
The dependency-free validator checks required pages, local files and fragments,
document metadata, heading structure, duplicate IDs, symlinks, and sensitive
artifact types.

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
