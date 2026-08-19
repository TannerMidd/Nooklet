/**
 * Serializes the capacity-inspection and durable-claim boundary shared by the
 * isolated worker's Usenet and YouTube runners. Once a claimant releases this
 * fence, its active row is visible to the other lane's capacity inspection.
 */
type DownloadAdmissionState = {
    tail: Promise<void>;
};

const admissionGlobals = globalThis as typeof globalThis & {
    __nookletDownloadAdmission?: DownloadAdmissionState;
};

const state: DownloadAdmissionState = admissionGlobals.__nookletDownloadAdmission ?? {
    tail: Promise.resolve(),
};

admissionGlobals.__nookletDownloadAdmission = state;

export async function withDownloadAdmissionFence<T>(operation: () => Promise<T>): Promise<T> {
    const previous = state.tail.catch(() => undefined);
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
        release = resolve;
    });

    state.tail = previous.then(() => current);
    await previous;

    try {
        return await operation();
    } finally {
        release();
    }
}
