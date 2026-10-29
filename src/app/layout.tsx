import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import type { ReactNode } from "react";
import { FeedbackProvider } from "@/components/ui/feedback";
import "./globals.css";

// Fraunces (display) and Public Sans (text), both SIL Open Font License 1.1,
// served from this site so pages do not wait on a third-party font host.
const display = localFont({
  src: [{ path: "./fonts/Fraunces-600.ttf", weight: "600", style: "normal" }],
  variable: "--font-fraunces",
  display: "swap",
  fallback: ["Georgia", "Times New Roman", "serif"],
});

const sans = localFont({
  src: [
    { path: "./fonts/PublicSans-400.ttf", weight: "400", style: "normal" },
    { path: "./fonts/PublicSans-700.ttf", weight: "700", style: "normal" },
  ],
  variable: "--font-public-sans",
  display: "swap",
  fallback: ["system-ui", "-apple-system", "Segoe UI", "sans-serif"],
});

export const metadata: Metadata = {
  title: {
    default: "CONNECT-DAET | Tours",
    template: "%s | CONNECT-DAET Tours",
  },
  description: "Accredited local tour operators and experiences in Daet, Camarines Norte.",
  applicationName: "CONNECT-DAET",
};

export const viewport: Viewport = {
  themeColor: "#2563eb",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-scroll-behavior="smooth" className={`${display.variable} ${sans.variable}`}>
      <body>
        <FeedbackProvider>{children}</FeedbackProvider>
      </body>
    </html>
  );
}
