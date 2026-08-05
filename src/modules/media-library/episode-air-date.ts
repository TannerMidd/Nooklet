/**
 * Episode air dates are stored as bare `YYYY-MM-DD` calendar dates with no
 * time and no zone, so they must be compared and rendered as calendar dates.
 *
 * The trap this module exists to close: `new Date("2026-08-06")` is parsed as
 * UTC midnight, which renders as 5 August anywhere west of Greenwich. An
 * episode would appear to air a day early, which is exactly the question these
 * helpers are asked.
 */

/** `YYYY-MM-DD` for an instant, in the running environment's local calendar. */
export function toCalendarDate(value: Date): string {
  const year = String(value.getFullYear()).padStart(4, "0");
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

/** Parses `YYYY-MM-DD` to local midnight, so formatting keeps the same day. */
export function parseCalendarDate(value: string | null | undefined): Date | null {
  if (!value) {
    return null;
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    return null;
  }

  const parsed = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
  );

  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Whether an episode has aired as of `today` (also `YYYY-MM-DD`).
 *
 * An unknown air date counts as aired: the episode exists in the library, and
 * refusing to search for it because metadata is incomplete would be worse than
 * searching and finding nothing.
 */
export function episodeHasAired(
  airDate: string | null | undefined,
  today: string,
): boolean {
  return !airDate || airDate <= today;
}
