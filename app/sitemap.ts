import type { MetadataRoute } from "next";

import { projectCaseStudies, siteUrl } from "@/content/site";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: `${siteUrl}/`,
      priority: 1
    },
    {
      url: `${siteUrl}/remarks`,
      priority: 0.7
    },
    ...projectCaseStudies.map((project) => ({
      url: `${siteUrl}/projects/${project.slug}`,
      priority: 0.8
    }))
  ];
}
