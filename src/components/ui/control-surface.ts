/**
 * The redesign gives every text control one surface: a 12px radius, a hairline
 * cream border, and a translucent cream fill over the near-black page. Focus
 * warms the border to amber — the page-level `:focus-visible` outline in
 * globals.css still carries the keyboard affordance.
 *
 * Import this instead of hand-writing border/background utilities so inputs,
 * selects, and textareas stay identical across the app.
 */
export const controlSurface =
  "min-h-11 w-full rounded-lg border border-cream/[0.10] bg-cream/[0.04] px-3.5 py-2 text-sm text-foreground outline-none transition placeholder:text-placeholder focus:border-accent/45 aria-[invalid=true]:border-accent-wine disabled:cursor-not-allowed disabled:opacity-60";

/** Selects add a pointer cursor; everything else matches {@link controlSurface}. */
export const selectSurface = `${controlSurface} cursor-pointer`;

/**
 * Field labels are uppercase micro-type in the redesign, not sentence-case
 * body text — see the login, connection, and preference forms in the spec.
 */
export const fieldLabel =
  "block text-xs font-semibold uppercase tracking-[0.08em] text-muted";
