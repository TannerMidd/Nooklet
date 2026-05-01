"use client";

import { useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

export type LibraryTabsTab = {
  id: string;
  label: string;
  description?: string;
  content: ReactNode;
};

type LibraryTabsProps = {
  tabs: LibraryTabsTab[];
  defaultTabId?: string;
};

export function LibraryTabs({ tabs, defaultTabId }: LibraryTabsProps) {
  const [activeTabId, setActiveTabId] = useState(defaultTabId ?? tabs[0]?.id ?? "");
  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0] ?? null;

  if (!activeTab) {
    return null;
  }

  return (
    <div className="space-y-5">
      <div
        role="tablist"
        aria-label="Library views"
        className="grid gap-1.5 rounded-lg border border-accent-cool/20 bg-panel/80 p-1.5 sm:inline-grid sm:grid-flow-col"
      >
        {tabs.map((tab) => {
          const active = tab.id === activeTab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls={`library-tab-panel-${tab.id}`}
              id={`library-tab-${tab.id}`}
              onClick={() => setActiveTabId(tab.id)}
              className={cn(
                "min-h-10 rounded-md px-4 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/50",
                active
                  ? "nooklet-tab--active text-accent-foreground"
                  : "text-muted hover:bg-accent-cool/10 hover:text-foreground",
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      <div
        role="tabpanel"
        id={`library-tab-panel-${activeTab.id}`}
        aria-labelledby={`library-tab-${activeTab.id}`}
        className="min-w-0"
      >
        {activeTab.content}
      </div>
    </div>
  );
}
