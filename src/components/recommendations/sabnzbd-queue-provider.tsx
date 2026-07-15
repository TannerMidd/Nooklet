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

import { type ActiveDownloadQueueState } from "@/app/api/service-connections/sabnzbd/queue/contract";

type SabnzbdQueueContextValue = {
  queueState: ActiveDownloadQueueState | null;
  isRefreshing: boolean;
  refreshQueue: () => Promise<void>;
  setQueueState: (state: ActiveDownloadQueueState) => void;
};

const defaultContextValue: SabnzbdQueueContextValue = {
  queueState: null,
  isRefreshing: false,
  refreshQueue: async () => undefined,
  setQueueState: () => undefined,
};

const SabnzbdQueueContext = createContext<SabnzbdQueueContextValue>(defaultContextValue);

async function fetchSabnzbdQueueState(): Promise<ActiveDownloadQueueState> {
  try {
    const response = await fetch("/api/service-connections/sabnzbd/queue", { cache: "no-store" });

    if (!response.ok) {
      return {
        connectionStatus: "error",
        statusMessage: "Unable to load active downloads right now.",
        snapshot: null,
        sources: [],
      };
    }

    return (await response.json()) as ActiveDownloadQueueState;
  } catch {
    return {
      connectionStatus: "error",
      statusMessage: "Unable to load active downloads right now.",
      snapshot: null,
      sources: [],
    };
  }
}

type SabnzbdQueueProviderProps = {
  children: ReactNode;
};

export function SabnzbdQueueProvider({ children }: SabnzbdQueueProviderProps) {
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
      const nextState = await fetchSabnzbdQueueState();

      // A queue action may have committed newer state while this read was in
      // flight. Never let the older poll overwrite that mutation response.
      if (stateVersionRef.current === startingVersion) {
        setQueueState(nextState);
      }
    } finally {
      refreshInFlightRef.current = false;
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let isActive = true;
    const startingVersion = stateVersionRef.current;
    refreshInFlightRef.current = true;

    void fetchSabnzbdQueueState().then((nextState) => {
      if (isActive && stateVersionRef.current === startingVersion) {
        setQueueState(nextState);
      }
    }).finally(() => {
      refreshInFlightRef.current = false;
    });

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void refreshQueue();
    }, queueState?.connectionStatus === "verified" ? 15000 : 60000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [queueState?.connectionStatus, refreshQueue]);

  const value = useMemo(
    () => ({ queueState, isRefreshing, refreshQueue, setQueueState: commitQueueState }),
    [commitQueueState, isRefreshing, queueState, refreshQueue],
  );

  return <SabnzbdQueueContext.Provider value={value}>{children}</SabnzbdQueueContext.Provider>;
}

export function useSabnzbdQueue() {
  return useContext(SabnzbdQueueContext);
}
