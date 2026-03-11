import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, Instrument_Serif } from "next/font/google";
import { MotionConfig } from "motion/react";
import { fullName, roleTitle, siteDescription, siteUrl } from "@/content/site";
import { SiteNav } from "@/components/site-nav";

import "./globals.css";

const sansFont = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap"
});

const monoFont = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap"
});

const displayFont = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-display",
  display: "swap"
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: `${fullName} | ${roleTitle}`,
    template: `%s | ${fullName}`
  },
  description: siteDescription,
  openGraph: {
    title: `${fullName} | ${roleTitle}`,
    description: siteDescription,
    url: siteUrl,
    siteName: fullName
  },
  twitter: {
    card: "summary_large_image",
    title: `${fullName} | ${roleTitle}`,
    description: siteDescription
  }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content="#0d1117" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      </head>
      <body className={`${sansFont.variable} ${monoFont.variable} ${displayFont.variable} antialiased`}>
        <MotionConfig reducedMotion="user">
          <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden will-change-transform" style={{ contain: "strict" }}>
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
