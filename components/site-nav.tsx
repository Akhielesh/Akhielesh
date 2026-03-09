"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";

import { navigation, siteName } from "@/content/site";
import { cn } from "@/lib/utils";

export function SiteNav() {
  const [active, setActive] = useState<string>("hero");
  const pathname = usePathname();
  const onHomePage = pathname === "/";

  const sectionIds = useMemo(() => navigation.map((item) => item.id), []);

  useEffect(() => {
    const elements = sectionIds
      .map((id) => document.getElementById(id))
      .filter((element): element is HTMLElement => Boolean(element));

    if (elements.length === 0) {
      return;
    }

    const ratioMap = new Map<string, number>();

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          ratioMap.set(entry.target.id, entry.isIntersecting ? entry.intersectionRatio : 0);
        }

        let bestId = "";
        let bestRatio = 0;

        for (const [id, ratio] of ratioMap) {
          if (ratio > bestRatio) {
            bestRatio = ratio;
            bestId = id;
          }
        }

        if (bestId) {
          setActive(bestId);
        }
      },
      {
        rootMargin: "-20% 0px -30% 0px",
        threshold: [0, 0.1, 0.2, 0.3, 0.5, 0.7, 1]
      }
    );

    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [sectionIds]);

  return (
    <header className="sticky top-0 z-50 px-4 pt-4 sm:px-6">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col gap-4 rounded-[2rem] border border-white/[0.12] bg-[hsl(220_18%_7%/0.92)] px-4 py-4 shadow-panel backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="flex items-center justify-between gap-4">
            {onHomePage ? (
              <a href="#hero" className="font-mono text-xs uppercase tracking-[0.34em] text-foreground/88">
                {siteName}
              </a>
            ) : (
              <Link href="/#hero" className="font-mono text-xs uppercase tracking-[0.34em] text-foreground/88">
                {siteName}
              </Link>
            )}
            <div className="hidden rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 font-mono text-[10px] uppercase tracking-[0.28em] text-muted-foreground sm:inline-flex">
              Product systems for AI
            </div>
          </div>
          <nav className="-mx-1 flex max-w-full items-center gap-1 overflow-x-auto overscroll-x-contain scroll-smooth rounded-full border border-white/[0.08] bg-white/[0.04] p-1 text-sm scrollbar-none [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {navigation.map((item) => {
              const isActive = onHomePage && active === item.id;

              const className = cn(
                "relative whitespace-nowrap rounded-full px-3.5 py-2 text-xs uppercase tracking-[0.22em] text-muted-foreground transition-colors duration-200 hover:text-foreground",
                isActive && "text-foreground"
              );

              const content = (
                <>
                  {isActive ? (
                    <motion.span
                      layoutId="active-nav-pill"
                      className="absolute inset-0 rounded-full border border-white/10 bg-white/[0.09]"
                      transition={{ type: "spring", stiffness: 380, damping: 34 }}
                    />
                  ) : null}
                  <span className="relative z-10">{item.label}</span>
                </>
              );

              return onHomePage ? (
                <a
                  key={item.id}
                  href={`#${item.id}`}
                  aria-current={isActive ? "page" : undefined}
                  className={className}
                  onClick={(e) => {
                    e.preventDefault();
                    document.getElementById(item.id)?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                >
                  {content}
                </a>
              ) : (
                <Link key={item.id} href={`/#${item.id}`} aria-current={isActive ? "page" : undefined} className={className}>
                  {content}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>
    </header>
  );
}
