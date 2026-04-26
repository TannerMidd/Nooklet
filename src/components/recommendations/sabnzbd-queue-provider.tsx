"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { type ActiveSabnzbdQueueState } from "@/modules/service-connections/workflows/get-active-sabnzbd-queue";

type SabnzbdQueueContextValue = {
  queueState: ActiveSabnzbdQueueState | null;
  isRefreshing: boolean;
  refreshQueue: () => Promise<void>;
};

const defaultContextValue: SabnzbdQueueContextValue = {
  queueState: null,
  isRefreshing: false,
  refreshQueue: async () => undefined,
};

const SabnzbdQueueContext = createContext<SabnzbdQueueContextValue>(defaultContextValue);

async function fetchSabnzbdQueueState(): Promise<ActiveSabnzbdQueueState> {
  try {
    const response = await fetch("/api/service-connections/sabnzbd/queue", { cache: "no-store" });

    if (!response.ok) {
      return {
        connectionStatus: "error",
        statusMessage: "Unable to load active SABnzbd requests right now.",
        snapshot: null,
      };
    }

    return (await response.json()) as ActiveSabnzbdQueueState;
  } catch {
    return {
      connectionStatus: "error",
      statusMessage: "Unable to load active SABnzbd requests right now.",
      snapshot: null,
    };
  }
}

type SabnzbdQueueProviderProps = {
  children: ReactNode;
};

export function SabnzbdQueueProvider({ children }: SabnzbdQueueProviderProps) {
  const [queueState, setQueueState] = useState<ActiveSabnzbdQueueState | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const refreshQueue = useCallback(async () => {
    setIsRefreshing(true);

    try {
      setQueueState(await fetchSabnzbdQueueState());
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let isActive = true;

    void fetchSabnzbdQueueState().then((nextState) => {
      if (isActive) {
        setQueueState(nextState);
      }
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
    () => ({ queueState, isRefreshing, refreshQueue }),
    [isRefreshing, queueState, refreshQueue],
  );

  return <SabnzbdQueueContext.Provider value={value}>{children}</SabnzbdQueueContext.Provider>;
}

export function useSabnzbdQueue() {
  return useContext(SabnzbdQueueContext);
}
