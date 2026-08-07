import { type ReactNode } from "react";

import { cn } from "@/lib/utils";

type PageHeaderProps = {
    /** Short uppercase kicker rendered above the title in the accent color. */
    eyebrow?: string;
    title: string;
    description?: string;
    actions?: ReactNode;
    children?: ReactNode;
    className?: string;
};

export function PageHeader({
    eyebrow,
    title,
    description,
    actions,
    children,
    className,
}: PageHeaderProps) {
    return (
        <header className={cn("relative", className)}>
            <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div className="min-w-0 max-w-4xl">
                    {eyebrow ? (
                        <p className="mb-1.5 text-xs font-semibold uppercase tracking-[0.10em] text-accent">
                            {eyebrow}
                        </p>
                    ) : null}
                    <h1 className="font-heading text-[40px] leading-[1.05] text-foreground">
                        {title}
                    </h1>
                    {description ? (
                        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">{description}</p>
                    ) : null}
                </div>
                {actions ? (
                    <div className="flex shrink-0 items-center gap-2.5">{actions}</div>
                ) : null}
            </div>
            {children ? <div className="mt-4">{children}</div> : null}
        </header>
    );
}
