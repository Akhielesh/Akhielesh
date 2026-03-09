import type { Metadata } from "next";
import { MotionConfig } from "motion/react";
import { IBM_Plex_Mono, IBM_Plex_Sans, Instrument_Serif } from "next/font/google";

import { roleTitle, siteDescription, siteName, siteUrl } from "@/content/site";
import { SiteNav } from "@/components/site-nav";

import "./globals.css";

const display = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-display"
});

const sans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans"
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono"
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: `${siteName} | ${roleTitle}`,
    template: `%s | ${siteName}`
  },
  description: siteDescription,
  openGraph: {
    title: `${siteName} | ${roleTitle}`,
    description: siteDescription,
    url: siteUrl,
    siteName
  },
  twitter: {
    card: "summary_large_image",
    title: `${siteName} | ${roleTitle}`,
    description: siteDescription
  }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable}`}>
      <body className="antialiased">
        <MotionConfig reducedMotion="user">
          <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
            <div className="absolute left-[8%] top-20 size-72 rounded-full bg-[#f0b56f]/10 blur-[110px]" />
            <div className="absolute bottom-0 right-[12%] size-80 rounded-full bg-[#8ac5cf]/10 blur-[120px]" />
            <div className="absolute left-1/2 top-0 h-64 w-[28rem] -translate-x-1/2 rounded-full bg-white/6 blur-[118px]" />
          </div>
          <SiteNav />
          <main>{children}</main>
        </MotionConfig>
      </body>
    </html>
  );
}
