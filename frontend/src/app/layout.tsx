import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { TopNav } from "@/components/layout/TopNav";

export const metadata: Metadata = {
  title: "Argus AI — Market Intelligence",
  description: "Institutional-grade finance intelligence powered by local AI",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Providers>
          <TopNav />
          <main className="pt-nav min-h-screen">
            {children}
          </main>
        </Providers>
      </body>
    </html>
  );
}
