"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

        if (visible?.target.id) {
          setActive(visible.target.id);
        }
      },
      {
        rootMargin: "-35% 0px -45% 0px",
        threshold: [0.15, 0.35, 0.6]
      }
    );

    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [sectionIds]);

  return (
    <header className="sticky top-0 z-50 border-b border-white/8 bg-background/75 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-5 py-4 sm:px-8">
        <Link href={onHomePage ? "#hero" : "/#hero"} className="font-mono text-xs uppercase tracking-[0.34em] text-foreground/88">
          {siteName}
        </Link>
        <nav className="flex max-w-full items-center gap-1 overflow-x-auto text-sm">
          {navigation.map((item) => (
            <Link
              key={item.id}
              href={onHomePage ? `#${item.id}` : `/#${item.id}`}
              aria-current={onHomePage && active === item.id ? "page" : undefined}
              className={cn(
                "rounded-full px-3 py-2 text-xs uppercase tracking-[0.22em] text-muted-foreground transition-colors duration-200 hover:text-foreground",
                onHomePage && active === item.id && "bg-white/[0.06] text-foreground"
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
