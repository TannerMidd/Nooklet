"use client";

import { useEffect, useRef, type RefObject } from "react";

const focusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

type ModalStackEntry = {
  token: symbol;
  element: HTMLElement | null;
  originalAriaHidden: string | null;
  originalInert: boolean;
  previouslyFocused: HTMLElement | null;
};

const modalStack: ModalStackEntry[] = [];

type ModalBackgroundState = {
  appRoot: HTMLElement | null;
  appRootAriaHidden: string | null;
  appRootInert: boolean;
  bodyOverflow: string;
  previouslyFocused: HTMLElement | null;
};

let backgroundState: ModalBackgroundState | null = null;

function restoreAriaHidden(element: HTMLElement, value: string | null) {
  if (value === null) {
    element.removeAttribute("aria-hidden");
  } else {
    element.setAttribute("aria-hidden", value);
  }
}

function syncModalAccessibility() {
  const topModal = modalStack.at(-1) ?? null;

  for (const entry of modalStack) {
    if (!entry.element) {
      continue;
    }

    if (entry === topModal) {
      entry.element.inert = entry.originalInert;
      restoreAriaHidden(entry.element, entry.originalAriaHidden);
    } else {
      entry.element.inert = true;
      entry.element.setAttribute("aria-hidden", "true");
    }
  }

  if (modalStack.length > 0) {
    document.body.style.overflow = "hidden";
    if (backgroundState?.appRoot) {
      backgroundState.appRoot.inert = true;
      backgroundState.appRoot.setAttribute("aria-hidden", "true");
    }
    return;
  }

  if (backgroundState) {
    document.body.style.overflow = backgroundState.bodyOverflow;
    if (backgroundState.appRoot) {
      backgroundState.appRoot.inert = backgroundState.appRootInert;
      restoreAriaHidden(backgroundState.appRoot, backgroundState.appRootAriaHidden);
    }
  }
}

type UseModalDialogOptions = {
  onClose: () => void;
  initialFocusRef?: RefObject<HTMLElement | null>;
  enabled?: boolean;
};

/** Provides focus trapping/restoration, Escape handling, and background inerting. */
export function useModalDialog<T extends HTMLElement = HTMLDivElement>({
  onClose,
  initialFocusRef,
  enabled = true,
}: UseModalDialogOptions) {
  const dialogRef = useRef<T | null>(null);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const token = Symbol("modal-dialog");
    const element = dialogRef.current;

    if (modalStack.length === 0) {
      const appRoot = document.getElementById("app-root");
      backgroundState = {
        appRoot,
        appRootAriaHidden: appRoot?.getAttribute("aria-hidden") ?? null,
        appRootInert: appRoot?.inert ?? false,
        bodyOverflow: document.body.style.overflow,
        previouslyFocused,
      };
    }

    modalStack.push({
      token,
      element,
      originalAriaHidden: element?.getAttribute("aria-hidden") ?? null,
      originalInert: element?.inert ?? false,
      previouslyFocused,
    });
    syncModalAccessibility();

    const focusTimer = window.setTimeout(() => {
      if (modalStack.at(-1)?.token !== token) {
        return;
      }

      const target = initialFocusRef?.current
        ?? dialogRef.current?.querySelector<HTMLElement>(focusableSelector)
        ?? dialogRef.current;
      target?.focus();
    }, 0);

    function handleKeyDown(event: KeyboardEvent) {
      if (modalStack.at(-1)?.token !== token) {
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab" || !dialogRef.current) {
        return;
      }

      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(focusableSelector),
      ).filter((element) => !element.hidden && element.getAttribute("aria-hidden") !== "true");

      if (focusable.length === 0) {
        event.preventDefault();
        dialogRef.current.focus();
        return;
      }

      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", handleKeyDown);
      const stackIndex = modalStack.findIndex((entry) => entry.token === token);
      const wasTopModal = modalStack.at(-1)?.token === token;
      if (stackIndex >= 0) {
        modalStack.splice(stackIndex, 1);
      }

      const finalFocus = modalStack.length === 0
        ? backgroundState?.previouslyFocused ?? previouslyFocused
        : wasTopModal
          ? previouslyFocused
          : null;
      syncModalAccessibility();

      if (modalStack.length === 0) {
        backgroundState = null;
      }

      if (finalFocus?.isConnected && (
        modalStack.length === 0
        || modalStack.at(-1)?.element?.contains(finalFocus)
      )) {
        finalFocus.focus();
      } else if (wasTopModal) {
        modalStack.at(-1)?.element?.focus();
      }
    };
  }, [enabled, initialFocusRef, onClose]);

  return dialogRef;
}
