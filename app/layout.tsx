import type { Metadata } from "next";
import { MotionConfig } from "motion/react";
import { roleTitle, siteDescription, siteName, siteUrl } from "@/content/site";
import { SiteNav } from "@/components/site-nav";

import "./globals.css";

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
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content="#0d1117" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600;700&family=Instrument+Serif&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased">
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
