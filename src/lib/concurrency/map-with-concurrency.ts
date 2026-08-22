/**
 * Runs `worker` over `items` with at most `limit` invocations in flight and
 * resolves to the results in input order.
 *
 * Fail-fast: once any worker rejects, remaining unclaimed items are not
 * scheduled — sibling runners drain their in-flight work and the first error
 * is rethrown. Bounded fan-out therefore stops paying external-API costs as
 * soon as the outcome is known to have failed. Extracted from the
 * season-fulfillment episode search so it has one shared implementation; the
 * cursor advances before the first await, so a throwing worker never skips
 * its own item's slot.
 */
export async function mapWithConcurrency<TItem, TResult>(
    items: readonly TItem[],
    limit: number,
    worker: (item: TItem) => Promise<TResult>,
): Promise<TResult[]> {
    if (!Number.isInteger(limit) || limit < 1) {
        throw new RangeError("Concurrency limit must be a positive integer.");
    }

    const results = new Array<TResult>(items.length);
    let cursor = 0;
    let stopped = false;
    // An array so the closure below can record a rejection without TypeScript
    // narrowing the read back to `never` afterwards.
    const firstError: unknown[] = [];
    const runners = Array.from({ length: Math.max(0, Math.min(limit, items.length)) }, async () => {
        while (!stopped && cursor < items.length) {
            const index = cursor;

            cursor += 1;
            const item = items[index];

            try {
                results[index] = await worker(item);
            } catch (error) {
                if (firstError.length === 0) {
                    firstError.push(error);
                }

                stopped = true;
            }
        }
    });

    await Promise.all(runners);

    if (firstError.length > 0) {
        throw firstError[0];
    }

    return results;
}
