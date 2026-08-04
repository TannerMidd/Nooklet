"use client";

import { useState, type ReactNode } from "react";

import { segmentedItemClass, segmentedTrack } from "@/components/ui/segmented-control";
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
        className={cn(segmentedTrack, "grid gap-0.5 sm:inline-grid sm:grid-flow-col")}
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
              className={segmentedItemClass(active)}
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
