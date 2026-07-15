"use client";

import {
  Activity,
  Compass,
  HardDrive,
  Library,
  Search,
  Settings,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import { useModalDialog } from "@/components/ui/use-modal-dialog";
import { usePortalTarget } from "@/components/ui/use-portal-target";
import { cn } from "@/lib/utils";

const quickActions = [
  { href: "/search", label: "Search for a title", description: "Find a movie or series and request it", icon: Search, keywords: "find add request download" },
  { href: "/discover", label: "Browse Discover", description: "Explore recommendations and popular releases", icon: Compass, keywords: "recommendations movies tv popular" },
  { href: "/library", label: "Open Library", description: "Browse available, requested, and missing media", icon: Library, keywords: "movies series files" },
  { href: "/in-progress", label: "View Activity", description: "Track downloads, imports, and problems", icon: Activity, keywords: "queue progress failed retry" },
  { href: "/settings/storage", label: "Check Storage", description: "Review workspace and destination capacity", icon: HardDrive, keywords: "disk space folders paths" },
  { href: "/settings", label: "Open Settings", description: "Connections, preferences, and automation", icon: Settings, keywords: "configure setup indexers" },
] as const;

const quickActionEvent = "nooklet:quick-actions";

export function QuickActionTrigger({ compact = false }: { compact?: boolean }) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(quickActionEvent))}
      aria-haspopup="dialog"
      className={cn(
        "inline-flex min-h-11 items-center rounded-lg border border-control bg-cream/[0.03] text-sm font-semibold text-muted transition hover:bg-cream/[0.07] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
        compact ? "w-11 justify-center" : "w-full justify-between gap-3 px-3",
      )}
      aria-label={compact ? "Open quick actions" : undefined}
    >
      <span className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap">
        <Sparkles aria-hidden="true" className="h-4 w-4" />
        {compact ? null : "Quick actions"}
      </span>
      {compact ? null : <kbd className="shrink-0 whitespace-nowrap rounded border border-cream/10 px-1.5 py-0.5 text-[10px] font-medium text-muted">Ctrl K</kbd>}
    </button>
  );
}

export function QuickActionPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const portalTarget = usePortalTarget();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const titleId = useId();
  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
  }, []);
  const dialogRef = useModalDialog({ onClose: close, initialFocusRef: inputRef, enabled: open });

  useEffect(() => {
    function handleOpen() {
      setOpen(true);
    }

    function handleShortcut(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((current) => !current);
      }
    }

    window.addEventListener(quickActionEvent, handleOpen);
    window.addEventListener("keydown", handleShortcut);
    return () => {
      window.removeEventListener(quickActionEvent, handleOpen);
      window.removeEventListener("keydown", handleShortcut);
    };
  }, []);

  const filteredActions = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return quickActions;
    return quickActions.filter((action) => (
      `${action.label} ${action.description} ${action.keywords}`.toLowerCase().includes(normalized)
    ));
  }, [query]);

  return (
    open && portalTarget ? createPortal(
        <div className="fixed inset-0 z-[95] flex items-start justify-center p-4 pt-[10vh] sm:pt-[14vh]">
          <button type="button" tabIndex={-1} aria-hidden="true" onClick={close} className="absolute inset-0 h-full w-full bg-black/75 backdrop-blur-sm" />
          <section
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-control bg-panel-raised shadow-2xl focus:outline-none"
          >
            <h2 id={titleId} className="sr-only">Quick actions</h2>
            <div className="flex items-center gap-3 border-b border-line px-4">
              <Search aria-hidden="true" className="h-5 w-5 shrink-0 text-muted" />
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Where do you want to go?"
                aria-label="Filter quick actions"
                className="min-h-14 min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted"
              />
              <button type="button" onClick={close} className="min-h-11 rounded-lg px-2 text-xs font-semibold text-muted hover:text-foreground">Esc</button>
            </div>
            <div className="max-h-[55vh] overflow-y-auto p-2">
              {filteredActions.length > 0 ? (
                <ul>
                  {filteredActions.map((action) => {
                    const Icon = action.icon;
                    return (
                      <li key={action.href}>
                        <Link
                          href={action.href}
                          onClick={close}
                          className="flex min-h-16 items-center gap-3 rounded-xl px-3 py-2 transition hover:bg-cream/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                        >
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
                            <Icon aria-hidden="true" className="h-5 w-5" />
                          </span>
                          <span className="min-w-0">
                            <span className="block text-sm font-semibold text-foreground">{action.label}</span>
                            <span className="mt-0.5 block text-xs leading-5 text-muted">{action.description}</span>
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="px-4 py-8 text-center text-sm text-muted">No matching action. Try “storage,” “search,” or “activity.”</p>
              )}
            </div>
          </section>
        </div>,
        portalTarget,
      ) : null
  );
}
