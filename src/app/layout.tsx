import type { Metadata } from "next";
import { Fraunces, Inter } from "next/font/google";
import { type ReactNode } from "react";

import { AppProviders } from "@/app/providers";

import "./globals.css";

const headingFont = Fraunces({
  subsets: ["latin"],
  variable: "--app-font-heading",
  style: ["normal", "italic"],
  axes: ["opsz"],
});

const bodyFont = Inter({
  subsets: ["latin"],
  variable: "--app-font-body",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Nooklet",
  description: "A cozy corner for what's next.",
};

type RootLayoutProps = {
  children: ReactNode;
};

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en">
      <body className={`${headingFont.variable} ${bodyFont.variable}`}>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
