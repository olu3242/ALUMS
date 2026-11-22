import type { Metadata, Viewport } from "next";
import { DM_Serif_Display, Inter, Manrope } from "next/font/google";
import { env } from "@/lib/env";
import "./globals.css";

const heading = Manrope({ subsets: ["latin"], weight: ["600", "700", "800"], variable: "--font-heading", display: "swap" });
const body = Inter({ subsets: ["latin"], variable: "--font-body", display: "swap" });
const serif = DM_Serif_Display({ subsets: ["latin"], weight: "400", variable: "--font-serif", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(env.siteUrl),
  title: { default: "ALUMS — Your Class. Your People. Your Network.", template: "%s · ALUMS" },
  description: "Find your graduating class, verify your membership and reconnect with classmates on ALUMS.",
  icons: { icon: "/icon.svg" },
};
export const viewport: Viewport = {
  themeColor: [{ media: "(prefers-color-scheme: light)", color: "#10243A" }, { media: "(prefers-color-scheme: dark)", color: "#091624" }],
};

// Applies a saved theme before paint (no flash). Value is constrained to light|dark.
const themeScript = `try{var t=localStorage.getItem('alums-theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${heading.variable} ${body.variable} ${serif.variable}`} suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head>
      <body>
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
