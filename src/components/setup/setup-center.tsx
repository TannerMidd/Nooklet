import { AlertTriangle, CheckCircle2, CircleDashed } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { LinkPendingOverlay } from "@/components/ui/link-pending-overlay";
import { Panel } from "@/components/ui/panel";
import {
    type ReadinessCapability,
    type ReadinessEvaluation,
} from "@/modules/readiness/evaluate-readiness";

function statusPresentation(status: ReadinessCapability["status"]) {
    if (status === "ready") {
        return {
            label: "Ready",
            badge: "accent-cool" as const,
            icon: CheckCircle2,
            iconClassName: "text-accent-cool",
        };
    }

    if (status === "needs-attention") {
        return {
            label: "Needs attention",
            badge: "wine" as const,
            icon: AlertTriangle,
            iconClassName: "text-accent-wine",
        };
    }

    return {
        label: "Optional",
        badge: "neutral" as const,
        icon: CircleDashed,
        iconClassName: "text-muted",
    };
}

function CapabilityCard({ capability }: { capability: ReadinessCapability }) {
    const presentation = statusPresentation(capability.status);
    const Icon = presentation.icon;

    return (
        <li className="flex min-w-0 flex-col rounded-2xl border border-cream/[0.08] bg-cream/[0.03] p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                    <Icon
                        aria-hidden="true"
                        className={`mt-0.5 h-5 w-5 shrink-0 ${presentation.iconClassName}`}
                    />
                    <div className="min-w-0">
                        <h3 className="font-semibold text-foreground">{capability.title}</h3>
                        <p className="mt-1 text-sm leading-6 text-muted">{capability.summary}</p>
                    </div>
                </div>
                <Badge variant={presentation.badge}>{presentation.label}</Badge>
            </div>

            {capability.details.length > 0 ? (
                <ul className="mt-3 space-y-1 pl-8 text-[13px] leading-5 text-muted">
                    {capability.details.map((detail) => (
                        <li key={detail} className="list-disc">
                            {detail}
                        </li>
                    ))}
                </ul>
            ) : null}

            <div className="mt-auto pt-4 pl-8">
                <Link
                    href={capability.remediationHref}
                    className="relative inline-flex min-h-11 items-center rounded-lg border border-cream/[0.12] bg-cream/[0.04] px-4 py-2 text-sm font-semibold text-foreground transition hover:border-accent/35 hover:bg-cream/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                >
                    <LinkPendingOverlay />
                    {capability.remediationLabel}
                </Link>
            </div>
        </li>
    );
}

export function SetupCenter({
    evaluation,
    canManageInstance,
}: {
    evaluation: ReadinessEvaluation;
    canManageInstance: boolean;
}) {
    return (
        <div className="space-y-6">
            <Panel
                title={evaluation.setupComplete ? "Nooklet is ready" : "Finish your setup"}
                description={
                    evaluation.setupComplete
                        ? "Metadata, the worker, and at least one complete request path passed the readiness check. Other media types and optional integrations can be finished whenever you want."
                        : "Progress is saved automatically from your real configuration. Complete the items that need attention, then return here to verify the whole request path."
                }
            >
                <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                        <span className="font-semibold text-foreground">Core request path</span>
                        <span className="text-muted">
                            {evaluation.completedCoreChecks} of {evaluation.totalCoreChecks} checks
                            ready
                        </span>
                    </div>
                    <div
                        role="progressbar"
                        aria-label="Setup progress"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={evaluation.progressPercent}
                        className="h-2 overflow-hidden rounded-full bg-cream/[0.07]"
                    >
                        <div
                            className="h-full rounded-full bg-accent-cool transition-[width]"
                            style={{ width: `${evaluation.progressPercent}%` }}
                        />
                    </div>
                    <p className="text-[13px] leading-5 text-muted">
                        {evaluation.readyForFirstRequest
                            ? "At least one complete movie or TV request path is ready."
                            : "A first request needs metadata, a downloader, an indexer, a writable destination, and a healthy worker."}
                    </p>
                </div>
            </Panel>

            {!canManageInstance ? (
                <div className="rounded-xl border border-accent/25 bg-accent/[0.08] px-4 py-3 text-sm leading-6 text-foreground">
                    Server connections, indexers, and storage are shared from the administrator
                    account. You can use them, while only an administrator can change them. Personal
                    history and notification settings remain yours.
                </div>
            ) : null}

            <ul className="grid gap-4 lg:grid-cols-2">
                {evaluation.capabilities.map((capability) => (
                    <CapabilityCard key={capability.id} capability={capability} />
                ))}
            </ul>
        </div>
    );
}
