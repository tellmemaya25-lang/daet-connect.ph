import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Fraunces, Public_Sans } from "next/font/google";
import "./globals.css";

const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-fraunces", display: "swap" });
const publicSans = Public_Sans({ subsets: ["latin"], variable: "--font-public-sans", display: "swap" });

export const metadata: Metadata = {
  title: {
    default: "CONNECT-DAET | Tours",
    template: "%s | CONNECT-DAET Tours",
  },
  description: "Accredited local tour operators and experiences in Daet, Camarines Norte.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${fraunces.variable} ${publicSans.variable}`}>
      <body>{children}</body>
    </html>
  );
}
