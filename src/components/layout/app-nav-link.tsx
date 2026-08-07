"use client";

import {
    Activity,
    BarChart3,
    Bell,
    Compass,
    Download,
    Film,
    Home,
    History,
    Library,
    Plug,
    Search,
    Settings,
    Shield,
    SlidersHorizontal,
    Tv,
    User,
    type LucideIcon,
} from "lucide-react";
import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode } from "react";

import { type NavigationItem } from "@/config/navigation";
import { cn } from "@/lib/utils";

function NavLinkPendingIndicator() {
    const { pending } = useLinkStatus();

    if (!pending) {
        return null;
    }

    return (
        <span
            aria-hidden="true"
            className="ml-2 inline-block h-3 w-3 flex-none animate-spin rounded-full border-2 border-accent border-t-transparent"
        />
    );
}

type AppNavLinkProps = {
    item: NavigationItem;
    badge?: ReactNode;
};

const navigationIcons: Record<string, LucideIcon> = {
    "/tv": Tv,
    "/home": Home,
    "/movies": Film,
    "/discover": Compass,
    "/search": Search,
    "/library": Library,
    "/history": History,
    "/in-progress": Download,
    "/analytics": BarChart3,
    "/settings/account": User,
    "/settings/connections": Plug,
    "/settings/indexers": Search,
    "/settings/preferences": SlidersHorizontal,
    "/settings/history": History,
    "/settings/notifications": Bell,
    "/health": Activity,
    "/admin": Shield,
    "/settings": Settings,
};

function matchesPath(pathname: string, href: string) {
    if (href === "/") {
        return pathname === href;
    }

    return pathname === href || pathname.startsWith(`${href}/`);
}

function isActivePath(pathname: string, item: NavigationItem) {
    return (
        matchesPath(pathname, item.href) ||
        item.activePrefixes?.some((prefix) => matchesPath(pathname, prefix)) ||
        false
    );
}

export function AppNavLink({ item, badge }: AppNavLinkProps) {
    const pathname = usePathname();
    const active = isActivePath(pathname, item);
    const Icon = navigationIcons[item.href] ?? Compass;

    return (
        <Link
            href={item.href}
            aria-current={active ? "page" : undefined}
            title={item.description}
            className={cn(
                "group relative flex min-h-11 items-center gap-[11px] rounded-lg px-3 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
                active
                    ? "bg-cream/[0.06] text-foreground"
                    : "text-muted hover:bg-cream/[0.05] hover:text-foreground",
            )}
        >
            <Icon
                aria-hidden="true"
                className={cn(
                    "h-[17px] w-[17px] shrink-0 transition",
                    active ? "text-accent" : "text-muted/90 group-hover:text-foreground",
                )}
            />
            <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
                <span className="flex min-w-0 items-center text-sm font-medium text-current">
                    <span className="block truncate">{item.label}</span>
                    <NavLinkPendingIndicator />
                </span>
                {badge}
            </span>
        </Link>
    );
}
