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
4. Review the diff before validation and commit:
   - Run `git status --short`, `git diff --stat`, and `git diff --check`.
   - Inspect the full diff for the files being committed.
   - Remove old dead code left behind by the change: unused imports, unreachable branches, obsolete helpers, stale exports, duplicate components, unused CSS classes/tokens, dead tests, and stale docs.
   - Search for replaced names or superseded patterns when the change renames, moves, or replaces code.
   - Confirm the implementation follows local patterns and project architecture rules.
5. Validate the slice with the relevant typecheck, lint, and test commands.
6. Check ADR compliance before committing. Use the `ADR Compliance Checker` agent for code or architecture-adjacent diffs; mark docs-only or instruction-only diffs as ADR not applicable.
7. Stage only the intended files. Never use `git add .`.
8. Commit promptly with a Conventional Commit subject.
9. Repeat until the request is complete.

## Before Final Response

Report:

- `git status --short`
- Typecheck result
- Lint result, including warnings
- Relevant test result
- Pre-commit review result, including dead-code and stale-pattern checks
- ADR result
- Commit hash(es) created, or the explicit reason no commit was created
