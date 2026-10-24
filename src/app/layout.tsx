import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "CONNECT-DAET | Tours",
    template: "%s | CONNECT-DAET Tours",
  },
  description: "Accredited local tour operators and experiences in Daet, Camarines Norte.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>{children}</body>
    </html>
  );
}
