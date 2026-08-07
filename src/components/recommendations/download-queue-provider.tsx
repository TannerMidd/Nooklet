"use client";

import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
    type ReactNode,
} from "react";

import { type ActiveDownloadQueueState } from "@/app/api/downloads/queue/contract";

type DownloadQueueContextValue = {
    queueState: ActiveDownloadQueueState | null;
    isRefreshing: boolean;
    refreshQueue: () => Promise<void>;
    setQueueState: (state: ActiveDownloadQueueState) => void;
};

const unavailableState: ActiveDownloadQueueState = {
    connectionStatus: "error",
    statusMessage: "Unable to load active downloads right now.",
    snapshot: null,
};

const defaultContextValue: DownloadQueueContextValue = {
    queueState: null,
    isRefreshing: false,
    refreshQueue: async () => undefined,
    setQueueState: () => undefined,
};

const DownloadQueueContext = createContext<DownloadQueueContextValue>(defaultContextValue);

async function fetchDownloadQueueState(): Promise<ActiveDownloadQueueState> {
    try {
        const response = await fetch("/api/downloads/queue", { cache: "no-store" });

        return response.ok
            ? ((await response.json()) as ActiveDownloadQueueState)
            : unavailableState;
    } catch {
        return unavailableState;
    }
}

export function DownloadQueueProvider({ children }: { children: ReactNode }) {
    const [queueState, setQueueState] = useState<ActiveDownloadQueueState | null>(null);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const refreshInFlightRef = useRef(false);
    const stateVersionRef = useRef(0);

    const commitQueueState = useCallback((state: ActiveDownloadQueueState) => {
        stateVersionRef.current += 1;
        setQueueState(state);
    }, []);

    const refreshQueue = useCallback(async () => {
        if (refreshInFlightRef.current) {
            return;
        }

        refreshInFlightRef.current = true;
        const startingVersion = stateVersionRef.current;

        setIsRefreshing(true);

        try {
            const nextState = await fetchDownloadQueueState();

            if (stateVersionRef.current === startingVersion) {
                setQueueState(nextState);
            }
        } finally {
            refreshInFlightRef.current = false;
            setIsRefreshing(false);
        }
    }, []);

    useEffect(() => {
        let active = true;
        const startingVersion = stateVersionRef.current;

        refreshInFlightRef.current = true;
        void fetchDownloadQueueState()
            .then((nextState) => {
                if (active && stateVersionRef.current === startingVersion) {
                    setQueueState(nextState);
                }
            })
            .finally(() => {
                refreshInFlightRef.current = false;
            });

        return () => {
            active = false;
        };
    }, []);

    useEffect(() => {
        const intervalId = window.setInterval(
            () => void refreshQueue(),
            queueState?.connectionStatus === "verified" ? 15_000 : 60_000,
        );

        return () => window.clearInterval(intervalId);
    }, [queueState?.connectionStatus, refreshQueue]);

    const value = useMemo(
        () => ({ queueState, isRefreshing, refreshQueue, setQueueState: commitQueueState }),
        [commitQueueState, isRefreshing, queueState, refreshQueue],
    );

    return <DownloadQueueContext.Provider value={value}>{children}</DownloadQueueContext.Provider>;
}

export function useDownloadQueue() {
    return useContext(DownloadQueueContext);
}
