import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { TopNav } from "@/components/layout/TopNav";

export const metadata: Metadata = {
  title: "Argus — Market Intelligence",
  description: "Real-time market intelligence. Track liquidity, volatility, positioning, and cross-asset flows.",
  icons: {
    icon: [
      { url: "/favicon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-48.png", sizes: "48x48", type: "image/png" },
    ],
    shortcut: "/favicon.ico",
    apple:    "/argus-icon.png",
  },
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
