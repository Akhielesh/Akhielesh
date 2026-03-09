import type { MetadataRoute } from "next";

import { roleTitle, siteDescription, siteName } from "@/content/site";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

  return {
    name: `${siteName} | ${roleTitle}`,
    short_name: siteName,
    description: siteDescription,
    start_url: basePath || "/",
    display: "standalone",
    background_color: "#0d1117",
    theme_color: "#0d1117",
    orientation: "any",
    icons: [
      {
        src: `${basePath}/icon.svg`,
        sizes: "any",
        type: "image/svg+xml"
      }
    ]
  };
}
