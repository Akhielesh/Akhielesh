import type { MetadataRoute } from "next";

import { roleTitle, siteDescription, siteName } from "@/content/site";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

  return {
    id: basePath || "/",
    name: `${siteName} | ${roleTitle}`,
    short_name: siteName,
    description: siteDescription,
    start_url: basePath || "/",
    scope: basePath || "/",
    display: "standalone",
    display_override: ["standalone", "browser"],
    background_color: "#0d1117",
    theme_color: "#0d1117",
    orientation: "portrait",
    icons: [
      {
        src: `${basePath}/icon.svg`,
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any"
      },
      {
        src: `${basePath}/icon.svg`,
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable"
      }
    ]
  };
}
