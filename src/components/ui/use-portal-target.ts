"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => undefined;
const getServerSnapshot = (): HTMLElement | null => null;
const getBrowserSnapshot = (): HTMLElement | null => document.body;

/** Returns the document body after hydration without a mount-effect render. */
export function usePortalTarget() {
  return useSyncExternalStore(subscribe, getBrowserSnapshot, getServerSnapshot);
}
