---
description: "Implement a Nooklet change with required validation, ADR review, and small focused commits."
---

# Implement A Nooklet Change

Follow `.github/copilot-instructions.md` as the controlling project policy.

For this implementation task, commits are authorized unless the user explicitly says not to commit.

## Required Workflow

1. Run `git status --short` before editing.
2. Inspect relevant files before changing them.
3. Make one coherent slice at a time.
4. Validate the slice with the relevant typecheck, lint, and test commands.
5. Check ADR compliance before committing. Use the `ADR Compliance Checker` agent for code or architecture-adjacent diffs; mark docs-only or instruction-only diffs as ADR not applicable.
6. Stage only the intended files. Never use `git add .`.
7. Commit promptly with a Conventional Commit subject.
8. Repeat until the request is complete.

## Before Final Response

Report:

- `git status --short`
- Typecheck result
- Lint result, including warnings
- Relevant test result
- ADR result
- Commit hash(es) created, or the explicit reason no commit was created
