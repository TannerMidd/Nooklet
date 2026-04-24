# Recommendarr Next

Recommendarr Next is a clean restart of Recommendarr built around explicit
workflow boundaries, domain-owned modules, and a single-container phase 1
deployment model.

## Source of truth

- `docs/adr/ADR-0001-rewrite-principles.md`
- `docs/product/behavior-matrix.md`
- `docs/architecture/project-structure.md`

## Initial stack

- Next.js App Router
- React with strict TypeScript
- Tailwind CSS
- TanStack Query
- Zod

Drizzle, Auth.js, and the phase 1 SQLite schema are next in the implementation
order after the scaffold baseline is in place.

## Commands

```bash
npm install
npm run dev
npm run lint
npm run typecheck
```

## Project shape

- `src/app`: route entry points and layouts
- `src/components`: shared UI and layout primitives
- `src/config`: navigation, rewrite rules, and implementation order
- `src/lib`: framework-agnostic helpers and environment validation
- `src/modules`: domain module registry and future module implementations
- `docs`: carried-forward ADRs and product behavior references

## Next implementation slice

1. Add Auth.js-backed local login and first-admin bootstrap.
2. Introduce Drizzle schema foundations and repository contracts.
3. Implement service-connection capability contracts.
4. Build watch-history sync workflows.
5. Build recommendation run workflows and UI flows on top.
