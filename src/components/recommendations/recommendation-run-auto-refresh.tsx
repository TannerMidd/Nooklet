"use client";

import { useRouter } from "next/navigation";
import { startTransition, useEffect } from "react";

type RecommendationRunAutoRefreshProps = {
  enabled: boolean;
};

export function RecommendationRunAutoRefresh({ enabled }: RecommendationRunAutoRefreshProps) {
  const router = useRouter();

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const intervalId = window.setInterval(() => {
      startTransition(() => {
        router.refresh();
      });
    }, 7000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [enabled, router]);

  return null;
}