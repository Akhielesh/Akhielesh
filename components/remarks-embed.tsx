"use client";

import { useEffect, useRef } from "react";

import { guestbookLabel, guestbookRepo } from "@/content/site";

export function RemarksEmbed() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;

    if (!container) {
      return;
    }

    container.innerHTML = "";

    const script = document.createElement("script");
    script.src = "https://utteranc.es/client.js";
    script.async = true;
    script.crossOrigin = "anonymous";
    script.setAttribute("repo", guestbookRepo);
    script.setAttribute("issue-term", "pathname");
    script.setAttribute("label", guestbookLabel);
    script.setAttribute("theme", "github-dark-dimmed");

    container.appendChild(script);

    return () => {
      container.innerHTML = "";
    };
  }, []);

  return <div ref={containerRef} className="min-h-[16rem]" />;
}
