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
        className="flex flex-wrap gap-2 rounded-2xl border border-line/70 bg-panel-strong/60 p-1.5"
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
                "rounded-xl px-4 py-2 text-sm font-semibold transition",
                active
                  ? "bg-accent text-accent-foreground shadow-soft"
                  : "text-muted hover:bg-panel hover:text-foreground",
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
      >
        {activeTab.content}
      </div>
    </div>
  );
}
