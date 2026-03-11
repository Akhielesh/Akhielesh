"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";

import { navigation, siteName, type SectionId } from "@/content/site";
import { cn } from "@/lib/utils";

export function SiteNav() {
  const [active, setActive] = useState<string>("hero");
  const pathname = usePathname();
  const onAdminPage = pathname.startsWith("/adminak");
  const onHomePage = pathname === "/";
  const sectionIds = useMemo(() => navigation.map((item) => item.id), []);

  useEffect(() => {
    if (!onHomePage) {
      return;
    }

    const syncHash = () => {
      const hash = window.location.hash.replace("#", "");
      if (hash && sectionIds.includes(hash as SectionId)) {
        setActive(hash);
      }
    };

    syncHash();
    window.addEventListener("hashchange", syncHash);
    return () => window.removeEventListener("hashchange", syncHash);
  }, [onHomePage, sectionIds]);

  useEffect(() => {
    if (!onHomePage) {
      return;
    }

    const elements = sectionIds
      .map((id) => document.getElementById(id))
      .filter((element): element is HTMLElement => Boolean(element));

    if (elements.length === 0) {
      return;
    }

    let frame = 0;

    const updateActiveSection = () => {
      const viewportHeight = window.innerHeight;
      const sectionWithMostVisibleArea =
        elements
          .map((element) => {
            const rect = element.getBoundingClientRect();
            const visibleHeight = Math.max(
              0,
              Math.min(rect.bottom, viewportHeight) - Math.max(rect.top, 0)
            );

            return {
              id: element.id,
              top: rect.top,
              visibleHeight
            };
          })
          .sort((left, right) => {
            if (right.visibleHeight !== left.visibleHeight) {
              return right.visibleHeight - left.visibleHeight;
            }

            return Math.abs(left.top) - Math.abs(right.top);
          })[0] ?? null;

      let current = sectionWithMostVisibleArea?.id ?? elements[0].id;

      const atPageBottom =
        window.innerHeight + window.scrollY >=
        document.documentElement.scrollHeight - 24;

      if (atPageBottom) {
        current = elements[elements.length - 1].id;
      }

      setActive((previous) => (previous === current ? previous : current));
    };

    const onScrollOrResize = () => {
      if (frame) {
        return;
      }

      frame = window.requestAnimationFrame(() => {
        updateActiveSection();
        frame = 0;
      });
    };

    updateActiveSection();
    window.addEventListener("scroll", onScrollOrResize, { passive: true });
    window.addEventListener("resize", onScrollOrResize);

    return () => {
      if (frame) {
        window.cancelAnimationFrame(frame);
      }

      window.removeEventListener("scroll", onScrollOrResize);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [onHomePage, sectionIds]);

  if (onAdminPage) {
    return null;
  }

  return (
    <header className="sticky top-0 z-50 px-4 pt-[max(1rem,env(safe-area-inset-top))] sm:px-6">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col gap-4 rounded-[2rem] border border-white/10 bg-[#0c1117] px-4 py-4 shadow-[0_24px_72px_-34px_rgba(0,0,0,0.88)] sm:flex-row sm:items-center sm:justify-between sm:px-5">
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
              AI products + data systems
            </div>
          </div>
          <nav className="-mx-1 flex max-w-full items-center gap-1 overflow-x-auto overscroll-x-contain scroll-smooth rounded-full border border-white/10 bg-[#151b24] p-1 text-sm scrollbar-none [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {navigation.map((item) => {
              const isActive = onHomePage && active === item.id;

              const className = cn(
                "relative whitespace-nowrap rounded-full px-3.5 py-2 text-xs uppercase tracking-[0.22em] text-foreground/62 transition-colors duration-200 hover:text-foreground",
                isActive && "text-foreground"
              );

              const content = (
                <>
                  {isActive ? (
                    <motion.span
                      layoutId="active-nav-pill"
                      className="absolute inset-0 rounded-full border border-white/12 bg-white/[0.14]"
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
                  aria-current={isActive ? "location" : undefined}
                  className={className}
                  onClick={() => setActive(item.id)}
                >
                  {content}
                </a>
              ) : (
                <Link
                  key={item.id}
                  href={`/#${item.id}`}
                  aria-current={isActive ? "location" : undefined}
                  className={className}
                >
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
