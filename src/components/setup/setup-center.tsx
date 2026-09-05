import { AlertTriangle, CheckCircle2, CircleDashed } from "lucide-react";
import Link from "next/link";

import { type SetupCapability, type SetupStep } from "@/components/setup/setup-checklist";
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
    capability,
    steps,
}: {
    evaluation: ReadinessEvaluation;
    canManageInstance: boolean;
    capability: SetupCapability;
    steps: SetupStep[];
}) {
    const completed = steps.filter((step) => step.ready === true).length;
    const ready = completed === steps.length;
    const label = capability === "movies" ? "Movies" : capability === "tv" ? "TV" : "YouTube";

    return (
        <div className="space-y-6">
            <nav aria-label="Set up a capability" className="flex flex-wrap gap-2">
                {(
                    [
                        ["movies", "Movies"],
                        ["tv", "TV"],
                        ["youtube", "YouTube"],
                    ] as const
                ).map(([value, title]) => (
                    <Link
                        key={value}
                        href={`/setup?capability=${value}`}
                        aria-current={capability === value ? "page" : undefined}
                        className={`inline-flex min-h-11 items-center rounded-full border px-5 text-sm font-semibold ${capability === value ? "border-accent bg-accent text-accent-foreground" : "border-cream/[0.14] text-foreground hover:bg-cream/[0.06]"}`}
                    >
                        {title}
                    </Link>
                ))}
            </nav>
            <Panel
                title={ready ? `${label} is ready` : `Set up ${label}`}
                description={
                    capability === "youtube"
                        ? "Archive public videos with a video destination and working tools. Movie and TV services are independent."
                        : "Complete one checklist for this request path. Shared services already configured for another media type count here too."
                }
            >
                <div className="mb-5 space-y-2">
                    <p className="text-sm text-muted">
                        {completed} of {steps.length} checks ready
                    </p>
                    <div
                        role="progressbar"
                        aria-label={`${label} setup progress`}
                        aria-valuemin={0}
                        aria-valuemax={steps.length}
                        aria-valuenow={completed}
                        className="h-2 overflow-hidden rounded-full bg-cream/[0.07]"
                    >
                        <div
                            className="h-full rounded-full bg-accent-cool"
                            style={{ width: `${(completed / steps.length) * 100}%` }}
                        />
                    </div>
                </div>
                <ol className="divide-y divide-cream/[0.08]">
                    {steps.map((step, index) => (
                        <li
                            key={step.id}
                            className="flex flex-col gap-3 py-4 first:pt-0 sm:flex-row sm:items-start sm:justify-between"
                        >
                            <div className="flex min-w-0 gap-3">
                                {step.ready ? (
                                    <CheckCircle2
                                        aria-hidden="true"
                                        className="mt-0.5 h-5 w-5 shrink-0 text-accent-cool"
                                    />
                                ) : (
                                    <span
                                        aria-hidden="true"
                                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-cream/20 text-xs text-muted"
                                    >
                                        {index + 1}
                                    </span>
                                )}
                                <div>
                                    <h3 className="flex flex-wrap items-baseline gap-x-2 gap-y-1 font-semibold text-foreground">
                                        <span>{step.title}</span>
                                        <span
                                            className={`whitespace-nowrap text-xs font-normal ${step.ready ? "text-accent-cool" : "text-muted"}`}
                                        >
                                            {step.ready
                                                ? "Ready"
                                                : step.ready === null
                                                  ? "Not checked"
                                                  : "Needs attention"}
                                        </span>
                                    </h3>
                                    <p className="mt-1 max-w-2xl text-sm leading-6 text-muted">
                                        {step.detail}
                                    </p>
                                </div>
                            </div>
                            <Link
                                href={step.href}
                                className="relative inline-flex min-h-11 shrink-0 items-center self-start rounded-lg border border-cream/[0.12] px-4 py-2 text-sm font-semibold text-foreground hover:bg-cream/[0.06]"
                            >
                                <LinkPendingOverlay />
                                {step.action}
                            </Link>
                        </li>
                    ))}
                </ol>
                {ready ? (
                    <Link
                        href={
                            capability === "youtube"
                                ? "/library/youtube"
                                : `/search?type=${capability === "tv" ? "tv" : "movie"}`
                        }
                        className="mt-4 inline-flex min-h-11 items-center rounded-lg bg-accent px-5 text-sm font-semibold text-accent-foreground"
                    >
                        {capability === "youtube" ? "Find a video" : "Find your first title"}
                    </Link>
                ) : null}
                {capability === "youtube" ? (
                    <p className="mt-4 text-sm leading-6 text-muted">
                        Tool checks run when you request them. A{" "}
                        <Link
                            className="font-semibold text-accent underline-offset-4 hover:underline"
                            href="/settings/connections?configure=youtube&returnTo=%2Fsetup%3Fcapability%3Dyoutube"
                        >
                            YouTube session
                        </Link>{" "}
                        is optional and only needed if guest access is blocked.
                    </p>
                ) : null}
            </Panel>
            {!canManageInstance ? (
                <p className="rounded-xl border border-accent/25 bg-accent/[0.08] px-4 py-3 text-sm leading-6 text-foreground">
                    An administrator manages shared connections, indexers, and storage. Use the
                    checklist to identify what needs their attention. Personal history and
                    notification settings remain yours.
                </p>
            ) : null}
            <details className="rounded-2xl border border-cream/[0.08] p-4 sm:p-5">
                <summary className="min-h-11 cursor-pointer font-semibold text-foreground">
                    All capabilities and optional integrations
                </summary>
                <ul className="mt-4 grid gap-4 lg:grid-cols-2">
                    {evaluation.capabilities.map((item) => (
                        <CapabilityCard key={item.id} capability={item} />
                    ))}
                </ul>
            </details>
        </div>
    );
}
