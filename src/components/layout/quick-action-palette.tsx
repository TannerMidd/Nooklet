"use client";

import { Activity, Compass, HardDrive, Library, Search, Settings, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import { DialogShell } from "@/components/ui/dialog-shell";
import { usePortalTarget } from "@/components/ui/use-portal-target";
import { cn } from "@/lib/utils";

type QuickAction = {
    href: string;
    label: string;
    description: string;
    group: string;
    icon: typeof Search;
    keywords: string;
};

const quickActions: readonly QuickAction[] = [
    {
        href: "/search",
        label: "Search for a title",
        description: "Find a movie or series and request it",
        group: "Search",
        icon: Search,
        keywords: "find add request download",
    },
    {
        href: "/discover",
        label: "Browse Discover",
        description: "Explore recommendations and popular releases",
        group: "Search",
        icon: Compass,
        keywords: "recommendations movies tv popular",
    },
    {
        href: "/library",
        label: "Open Library",
        description: "Browse available, requested, and missing media",
        group: "Go to",
        icon: Library,
        keywords: "movies series files",
    },
    {
        href: "/in-progress",
        label: "View Activity",
        description: "Track downloads, imports, and problems",
        group: "Go to",
        icon: Activity,
        keywords: "queue progress failed retry",
    },
    {
        href: "/settings/storage",
        label: "Check Storage",
        description: "Review workspace and destination capacity",
        group: "Go to",
        icon: HardDrive,
        keywords: "disk space folders paths",
    },
    {
        href: "/settings",
        label: "Open Settings",
        description: "Connections, preferences, and automation",
        group: "Go to",
        icon: Settings,
        keywords: "configure setup indexers",
    },
];

const quickActionEvent = "nooklet:quick-actions";

export function QuickActionTrigger({ compact = false }: { compact?: boolean }) {
    return (
        <button
            type="button"
            onClick={() => window.dispatchEvent(new Event(quickActionEvent))}
            aria-haspopup="dialog"
            className={cn(
                "inline-flex min-h-11 items-center rounded-lg border border-cream/[0.14] bg-cream/[0.03] text-sm font-semibold text-muted transition hover:bg-cream/[0.07] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
                compact ? "w-11 justify-center" : "w-full justify-between gap-3 px-3",
            )}
            aria-label={compact ? "Open quick actions" : undefined}
        >
            <span className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap">
                <Sparkles aria-hidden="true" className="h-4 w-4" />
                {compact ? null : "Quick actions"}
            </span>
            {compact ? null : (
                <kbd className="shrink-0 whitespace-nowrap rounded border border-cream/10 px-1.5 py-0.5 text-[10px] font-medium text-muted">
                    Ctrl K
                </kbd>
            )}
        </button>
    );
}

/** Consecutive actions sharing a group collapse into labeled sections. */
function groupActions(actions: readonly QuickAction[]) {
    const groups: { title: string; items: QuickAction[] }[] = [];

    for (const action of actions) {
        const lastGroup = groups.at(-1);

        if (lastGroup && lastGroup.title === action.group) {
            lastGroup.items.push(action);
        } else {
            groups.push({ title: action.group, items: [action] });
        }
    }

    return groups;
}

export function QuickActionPalette() {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [activeIndex, setActiveIndex] = useState(0);
    const router = useRouter();
    const portalTarget = usePortalTarget();
    const inputRef = useRef<HTMLInputElement | null>(null);
    const activeRowRef = useRef<HTMLAnchorElement | null>(null);
    const titleId = useId();

    const close = useCallback(() => {
        setOpen(false);
        setQuery("");
        setActiveIndex(0);
    }, []);

    const filteredActions = useMemo(() => {
        const normalized = query.trim().toLowerCase();

        if (!normalized) {
            return quickActions;
        }

        return quickActions.filter((action) =>
            `${action.label} ${action.description} ${action.keywords}`
                .toLowerCase()
                .includes(normalized),
        );
    }, [query]);

    // Groups preserve the filtered order, so the flattened rendered-row order
    // equals filteredActions and the active-index cursor lines up 1:1.
    const groups = useMemo(() => groupActions(filteredActions), [filteredActions]);

    useEffect(() => {
        activeRowRef.current?.scrollIntoView({ block: "nearest" });
    }, [activeIndex]);

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

    const moveActiveIndex = useCallback(
        (delta: number) => {
            setActiveIndex((current) =>
                Math.min(Math.max(current + delta, 0), filteredActions.length - 1),
            );
        },
        [filteredActions.length],
    );

    const activateRow = useCallback(
        (index: number) => {
            const action = filteredActions[index];

            if (!action) {
                return;
            }

            close();
            router.push(action.href);
        },
        [close, filteredActions, router],
    );

    useEffect(() => {
        if (!open) {
            return;
        }

        function handleKeyDown(event: KeyboardEvent) {
            if (event.key === "ArrowDown") {
                event.preventDefault();
                moveActiveIndex(1);
            } else if (event.key === "ArrowUp") {
                event.preventDefault();
                moveActiveIndex(-1);
            } else if (event.key === "Enter") {
                event.preventDefault();
                activateRow(activeIndex);
            }
        }

        window.addEventListener("keydown", handleKeyDown);

        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [activateRow, activeIndex, moveActiveIndex, open]);

    return open && portalTarget
        ? createPortal(
              <DialogShell
                  titleId={titleId}
                  title="Quick actions"
                  size="md"
                  align="top"
                  hideHeader
                  zIndex={95}
                  onClose={close}
                  initialFocusRef={inputRef}
                  subBar={
                      <div className="flex items-center gap-3 border-b border-cream/[0.07] px-4 sm:px-5">
                          <Search aria-hidden="true" className="h-5 w-5 shrink-0 text-muted" />
                          <input
                              ref={inputRef}
                              value={query}
                              onChange={(event) => {
                                  setQuery(event.target.value);
                                  // Reset the cursor whenever the result set changes shape.
                                  setActiveIndex(0);
                              }}
                              placeholder="Where do you want to go?"
                              aria-label="Filter quick actions"
                              className="min-h-14 min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted"
                          />
                          <kbd
                              aria-hidden="true"
                              className="shrink-0 rounded-md border border-cream/[0.12] px-[7px] py-[3px] font-mono text-[10.5px] text-muted"
                          >
                              esc
                          </kbd>
                      </div>
                  }
                  bodyClassName="p-2 pb-3"
              >
                  {filteredActions.length > 0 ? (
                      <div role="listbox" aria-label="Quick actions">
                          {groups.map((group) => (
                              <div key={group.title}>
                                  <p className="mb-1.5 px-2 pt-2 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted">
                                      {group.title}
                                  </p>
                                  <ul>
                                      {group.items.map((action) => {
                                          const Icon = action.icon;
                                          const isActive =
                                              filteredActions.indexOf(action) === activeIndex;

                                          return (
                                              <li key={action.href}>
                                                  <Link
                                                      ref={isActive ? activeRowRef : undefined}
                                                      href={action.href}
                                                      onClick={close}
                                                      onMouseEnter={() =>
                                                          setActiveIndex(
                                                              filteredActions.indexOf(action),
                                                          )
                                                      }
                                                      role="option"
                                                      aria-selected={isActive}
                                                      tabIndex={-1}
                                                      className={cn(
                                                          "flex min-h-14 items-center gap-3 rounded-xl px-3 py-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
                                                          isActive && "bg-accent/10",
                                                      )}
                                                  >
                                                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
                                                          <Icon
                                                              aria-hidden="true"
                                                              className="h-[18px] w-[18px]"
                                                          />
                                                      </span>
                                                      <span className="min-w-0">
                                                          <span className="block text-[13.5px] font-semibold text-foreground">
                                                              {action.label}
                                                          </span>
                                                          <span className="mt-0.5 block truncate text-xs leading-5 text-muted">
                                                              {action.description}
                                                          </span>
                                                      </span>
                                                  </Link>
                                              </li>
                                          );
                                      })}
                                  </ul>
                              </div>
                          ))}
                      </div>
                  ) : (
                      <p className="px-4 py-8 text-center text-sm text-muted">
                          No matching action. Try “storage,” “search,” or “activity.”
                      </p>
                  )}
              </DialogShell>,
              portalTarget,
          )
        : null;
}
