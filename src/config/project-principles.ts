export const documentationSources = [
  "docs/adr/ADR-0001-architecture-principles.md",
  "docs/product/behavior-matrix.md",
  "docs/architecture/project-structure.md",
] as const;

export const architecturalRules = [
  "Keep UI routes thin and delegate behavior to explicit module workflows.",
  "Do not expose generic save-setting or proxy endpoints.",
  "Do not let screens call vendor clients or adapters directly.",
  "Keep credential ownership decisions inside service-connections / credential-vault, not in UI code.",
  "Model recommendation generation, watch-history sync, onboarding, connection verification, and admin actions as explicit workflows with separate phase files.",
  "Server-only adapters expose typed capabilities, not ad hoc service-specific methods consumed by screens.",
] as const;
