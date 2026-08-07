"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

import { linkLibraryTitleTmdbAction } from "@/app/(workspace)/library/actions";

type Props = {
    titleId: string;
    hasTmdbId: boolean;
};

/**
 * Fires once per dialog mount to lazily link a TV title to its TMDB id when
 * none is recorded yet. This used to run synchronously on the server render
 * path, blocking the dialog on an external API call; the trigger moved to the
 * client so the dialog paints immediately and TMDB-dependent UI fills in on
 * router refresh.
 */
export function LinkLibraryTitleTmdbOnMount({ titleId, hasTmdbId }: Props) {
    const router = useRouter();
    const requested = useRef(false);

    useEffect(() => {
        if (hasTmdbId || requested.current) {
            return;
        }

        requested.current = true;

        void linkLibraryTitleTmdbAction(titleId).then((result) => {
            if (result.status === "ok") {
                router.refresh();
            }
        });
    }, [hasTmdbId, router, titleId]);

    return null;
}
