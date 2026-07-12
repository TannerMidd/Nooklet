import { redirect } from "next/navigation";

import { getBootstrapStatus } from "@/modules/identity-access/workflows/bootstrap-status";

import { BootstrapForm } from "./bootstrap-form";

export const dynamic = "force-dynamic";

export default async function BootstrapPage() {
  const bootstrapStatus = await getBootstrapStatus();

  if (!bootstrapStatus.isOpen) {
    redirect("/login");
  }

  return (
    <div className="nk-enter">
      <div className="mb-7 flex items-center gap-2.5">
        <span aria-hidden="true" className="nk-brand-dot h-2.5 w-2.5" />
        <span className="nooklet-wordmark text-[26px] leading-none text-foreground">Nooklet</span>
      </div>
      <h1 className="font-heading text-[38px] leading-[1.1] text-foreground">First things first.</h1>
      <p className="mb-8 mt-2 text-[15px] leading-6 text-muted">
        Create the administrator account for this install — you&apos;ll use it to sign in and
        invite anyone else.
      </p>
      <BootstrapForm />
    </div>
  );
}
