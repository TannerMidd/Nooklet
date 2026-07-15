type ImportLockGlobals = {
  tails?: Map<string, Promise<void>>;
};

const globals = globalThis as typeof globalThis & {
  __nookletCompletedImportLocks?: ImportLockGlobals;
};
const state = globals.__nookletCompletedImportLocks ?? {};
globals.__nookletCompletedImportLocks = state;
state.tails ??= new Map();

/** Serializes filesystem import work for one user inside this process. */
export async function withCompletedImportLock<T>(userId: string, work: () => Promise<T>): Promise<T> {
  const prior = state.tails!.get(userId) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tail = prior.then(() => gate);
  state.tails!.set(userId, tail);

  await prior;

  try {
    return await work();
  } finally {
    release();
    if (state.tails!.get(userId) === tail) {
      state.tails!.delete(userId);
    }
  }
}
