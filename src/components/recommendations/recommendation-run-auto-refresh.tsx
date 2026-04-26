"use client";

import { useEffect } from "react";

type RecommendationRunAutoRefreshProps = {
  enabled: boolean;
};

export function RecommendationRunAutoRefresh({ enabled }: RecommendationRunAutoRefreshProps) {
  useEffect(() => {
    if (!enabled) {
      return;
    }

    const intervalId = window.setInterval(() => {
      window.location.reload();
    }, 7000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [enabled]);

  return null;
}