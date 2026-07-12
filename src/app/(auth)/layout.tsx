import { type ReactNode } from "react";

type AuthLayoutProps = {
  children: ReactNode;
};

export default function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <main className="nk-auth-backdrop flex min-h-screen items-center justify-center px-6 py-12">
      <div className="w-full max-w-[400px]">{children}</div>
    </main>
  );
}
