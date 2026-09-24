import type { Metadata } from "next";
import { Suspense } from "react";
import { NavigationProgress } from "@/components/shell/navigation-progress";
import "./globals.css";

export const metadata: Metadata = {
  title: "Boyce Meta Intelligence",
  description: "Internal Meta Ads reporting and intelligence for Boyce Creative",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">
        <Suspense fallback={null}>
          <NavigationProgress />
        </Suspense>
        {children}
      </body>
    </html>
  );
}
