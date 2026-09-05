"use client";

import { ShieldCheck, Trash2, Upload } from "lucide-react";
import { useActionState, useRef, useState } from "react";

import {
    initialConnectionActionState,
    type ConnectionActionState,
} from "@/app/(workspace)/settings/connections/action-state";
import { AlertDialog } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { StatusMessage } from "@/components/ui/status-message";
import type { ServiceConnectionSummary } from "@/modules/service-connections/workflows/list-connection-summaries";

import { submitYouTubeAccessAction } from "./youtube-access-actions";

function statusStyle(status: ServiceConnectionSummary["status"]) {
    if (status === "verified") {
        return "bg-accent-cool/[0.12] text-accent-cool";
    }

    if (status === "error") {
        return "bg-accent-wine/[0.12] text-accent-wine";
    }

    return "bg-cream/[0.06] text-muted";
}

function ActionResult({ state }: { state: ConnectionActionState }) {
    return <StatusMessage status={state.status} message={state.message ?? null} />;
}

export function YouTubeAccessCard({
    summary,
    canManage,
    initiallyExpanded = false,
}: {
    summary: ServiceConnectionSummary;
    canManage: boolean;
    initiallyExpanded?: boolean;
}) {
    const [state, formAction, pending] = useActionState(
        submitYouTubeAccessAction,
        initialConnectionActionState,
    );
    const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);
    const [guidanceOpen, setGuidanceOpen] = useState(initiallyExpanded);
    const disconnectButtonRef = useRef<HTMLButtonElement | null>(null);
    const connected = summary.status !== "disconnected";

    return (
        <>
            <form
                action={formAction}
                className="space-y-5 rounded-2xl border border-cream/[0.08] bg-cream/[0.03] p-5 sm:p-6"
            >
                <button
                    ref={disconnectButtonRef}
                    type="submit"
                    name="intent"
                    value="disconnect"
                    className="hidden"
                    aria-hidden="true"
                    tabIndex={-1}
                />

                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <h3 className="font-heading text-xl text-foreground">YouTube access</h3>
                        <p className="mt-1 max-w-2xl text-sm leading-6 text-muted">
                            Supplies a dedicated signed-in session when YouTube blocks this
                            server&apos;s anonymous guest traffic.
                        </p>
                    </div>
                    <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${statusStyle(summary.status)}`}
                    >
                        {summary.status === "disconnected"
                            ? "Not configured"
                            : summary.status.charAt(0).toUpperCase() + summary.status.slice(1)}
                    </span>
                </div>

                <details
                    open={guidanceOpen}
                    onToggle={(event) => setGuidanceOpen(event.currentTarget.open)}
                    className="rounded-xl border border-cream/[0.08] bg-black/10 p-4 text-sm leading-6 text-muted"
                >
                    <summary className="min-h-11 cursor-pointer font-medium text-foreground">
                        How to create a YouTube session export
                    </summary>
                    <ol className="mt-2 list-decimal space-y-1 pl-5">
                        <li>Open one private/incognito window and sign in to YouTube.</li>
                        <li>
                            In that same tab, open{" "}
                            <a
                                className="text-accent underline underline-offset-4"
                                href="https://www.youtube.com/robots.txt"
                                target="_blank"
                                rel="noreferrer"
                            >
                                YouTube robots.txt
                            </a>
                            .
                        </li>
                        <li>Export only youtube.com cookies in Netscape cookies.txt format.</li>
                        <li>Close the private window and do not reopen that session.</li>
                    </ol>
                    <p className="mt-3">
                        Use a dedicated low-value account. Nooklet encrypts the export in SQLite,
                        creates a private tmpfs file only while yt-dlp runs, and never stores a
                        Google password. See the{" "}
                        <a
                            className="text-accent underline underline-offset-4"
                            href="https://github.com/yt-dlp/yt-dlp/wiki/Extractors#exporting-youtube-cookies"
                            target="_blank"
                            rel="noreferrer"
                        >
                            official yt-dlp export instructions
                        </a>
                        .
                    </p>
                </details>

                {connected ? (
                    <div className="grid gap-2 text-sm sm:grid-cols-2">
                        <p>
                            <span className="text-muted">Saved material:</span>{" "}
                            <span className="text-foreground">
                                {summary.maskedSecret ?? "Encrypted session"}
                            </span>
                        </p>
                        <p>
                            <span className="text-muted">Last verified:</span>{" "}
                            <span className="text-foreground">
                                {summary.lastVerifiedAt
                                    ? new Intl.DateTimeFormat("en", {
                                          dateStyle: "medium",
                                          timeStyle: "short",
                                      }).format(summary.lastVerifiedAt)
                                    : "Never"}
                            </span>
                        </p>
                        <p className="sm:col-span-2">{summary.statusMessage}</p>
                    </div>
                ) : null}

                {canManage ? (
                    <div className="space-y-3">
                        <label className="block space-y-2">
                            <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">
                                YouTube cookies.txt
                            </span>
                            <input
                                type="file"
                                name="cookiesFile"
                                aria-label="YouTube cookies.txt"
                                accept=".txt,text/plain"
                                disabled={pending}
                                aria-invalid={Boolean(state.fieldErrors?.cookiesFile)}
                                aria-describedby={
                                    state.fieldErrors?.cookiesFile
                                        ? "youtube-cookies-error"
                                        : undefined
                                }
                                aria-errormessage={
                                    state.fieldErrors?.cookiesFile
                                        ? "youtube-cookies-error"
                                        : undefined
                                }
                                className="block w-full rounded-xl border border-cream/[0.10] bg-panel px-3 py-2.5 text-sm text-foreground file:mr-4 file:rounded-lg file:border-0 file:bg-accent file:px-3 file:py-2 file:font-semibold file:text-background"
                            />
                            {state.fieldErrors?.cookiesFile ? (
                                <span
                                    id="youtube-cookies-error"
                                    className="text-sm text-accent-wine"
                                >
                                    {state.fieldErrors.cookiesFile}
                                </span>
                            ) : null}
                        </label>

                        <div className="flex flex-wrap gap-2">
                            <Button
                                type="submit"
                                name="intent"
                                value="test-save"
                                disabled={pending}
                                size="sm"
                            >
                                <Upload aria-hidden="true" className="h-4 w-4" />
                                {pending ? "Testing…" : "Test & save session"}
                            </Button>
                            <Button
                                type="submit"
                                name="intent"
                                value="verify"
                                disabled={pending || !connected}
                                variant="secondary"
                                size="sm"
                            >
                                <ShieldCheck aria-hidden="true" className="h-4 w-4" /> Verify saved
                            </Button>
                            <Button
                                type="button"
                                disabled={pending || !connected}
                                variant="danger"
                                size="sm"
                                onClick={() => setConfirmingDisconnect(true)}
                            >
                                <Trash2 aria-hidden="true" className="h-4 w-4" /> Remove session
                            </Button>
                        </div>
                        <ActionResult state={state} />
                    </div>
                ) : (
                    <p className="text-sm text-muted">
                        Only an administrator can replace or verify the shared YouTube session.
                    </p>
                )}
            </form>

            <AlertDialog
                open={confirmingDisconnect}
                title="Remove the saved YouTube session?"
                description="Guest extraction may remain blocked on this server. Existing downloaded files are not affected."
                confirmLabel="Remove session"
                onClose={() => setConfirmingDisconnect(false)}
                onConfirm={() => {
                    setConfirmingDisconnect(false);
                    disconnectButtonRef.current?.click();
                }}
            />
        </>
    );
}
