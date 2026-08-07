export async function register() {
    if (process.env.NEXT_RUNTIME !== "nodejs") {
        return;
    }

    const { ensureDatabaseReady } = await import("@/lib/database/client");

    ensureDatabaseReady();

    // Every supported runtime starts background work in a separately supervised
    // process. Keeping instrumentation web-only prevents a development or native
    // deployment from accidentally reintroducing bind-mount calls into Next's
    // libuv pool.
}
