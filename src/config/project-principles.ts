export const documentationSources = [
  "docs/adr/ADR-0001-rewrite-principles.md",
  "docs/product/behavior-matrix.md",
  "docs/architecture/project-structure.md",
] as const;

export const architecturalRules = [
  "Do not port the current component tree into React.",
  "Do not port the current API shape into Next route handlers.",
  "Do not expose generic save-setting or proxy endpoints.",
  "Keep UI routes thin and move behavior into explicit workflows.",
  "Do not let screens call vendor clients directly.",
  "Model recommendation generation, watch-history sync, onboarding, connection verification, and admin actions as explicit workflows.",
] as const;

export const implementationOrder = [
  "Scaffold the new project and establish the baseline route surface.",
  "Implement schema, local auth, first-admin bootstrap, and credential-vault foundations.",
  "Define service-connection capability contracts and verification workflows.",
  "Implement watch-history sync with explicit phases and persisted run state.",
  "Implement recommendation workflows, persistence, retries, and feedback.",
  "Build route flows on top of the module boundaries and add hardening tests.",
] as const;
