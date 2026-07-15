# Nooklet engineering dossier

This directory is the source artifact for Nooklet's public technical architecture
dossier. It is a dependency-free static site designed to deploy beneath the
repository's GitHub Pages project path.

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

Serve the repository with any static file server and open
`engineering-dossier/index.html` through that server. The site intentionally
uses only relative asset paths, makes no runtime third-party requests, and does
not require a build step.

## Publication

`.github/workflows/engineering-dossier-pages.yml` validates this directory,
uploads it as the exact Pages artifact, and deploys it from `main`. The Pages
source for the repository must be set to **GitHub Actions**.

## Public-data policy

Do not add signed-in screenshots, environment files, database files, private
paths, account details, service endpoints, API keys, queue payloads, or media
history. Examples should use generic container paths such as
`/downloads/nooklet-engine` and `/media/movies`.
