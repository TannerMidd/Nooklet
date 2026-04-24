import { type ReactNode } from "react";

type AuthLayoutProps = {
  children: ReactNode;
};

export default function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <main className="px-6 py-8 md:py-10">
      <div className="mx-auto max-w-5xl">{children}</div>
    </main>
  );
}
