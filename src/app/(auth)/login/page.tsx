import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { getBootstrapStatus } from "@/modules/identity-access/workflows/bootstrap-status";

import { LoginForm } from "./login-form";
import { safeCallbackUrl } from "./safe-callback-url";

export const dynamic = "force-dynamic";

type LoginPageProps = {
    searchParams?: Promise<{
        bootstrapped?: string;
        callbackUrl?: string;
        passwordChanged?: string;
    }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
    const [session, bootstrapStatus, resolvedSearchParams] = await Promise.all([
        auth(),
        getBootstrapStatus(),
        searchParams,
    ]);

    const callbackUrl = safeCallbackUrl(resolvedSearchParams?.callbackUrl);

    if (session?.user) {
        redirect(callbackUrl);
    }

    if (bootstrapStatus.isOpen) {
        redirect("/bootstrap");
    }

    return (
        <div className="nk-enter">
            <div className="mb-7 flex items-center gap-2.5">
                <span aria-hidden="true" className="nk-brand-dot h-2.5 w-2.5" />
                <span className="nooklet-wordmark text-[26px] leading-none text-foreground">
                    Nooklet
                </span>
            </div>
            <h1 className="font-heading text-[38px] leading-[1.1] text-foreground">
                Welcome back.
            </h1>
            <p className="mb-8 mt-2 text-[15px] leading-6 text-muted">
                Your picks, library, and queue are right where you left them.
            </p>
            <LoginForm
                callbackUrl={callbackUrl}
                showBootstrapSuccess={resolvedSearchParams?.bootstrapped === "1"}
                showPasswordChangedSuccess={resolvedSearchParams?.passwordChanged === "1"}
            />
        </div>
    );
}
