import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getProjectCaseStudy, projectCaseStudies, siteName } from "@/content/site";
import { ProjectCaseStudyPage } from "@/components/project-case-study";

type ProjectPageProps = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return projectCaseStudies.map((project) => ({ slug: project.slug }));
}

export async function generateMetadata({ params }: ProjectPageProps): Promise<Metadata> {
  const { slug } = await params;
  const project = getProjectCaseStudy(slug);

  if (!project) {
    return {};
  }

  return {
    title: project.title,
    description: project.summary,
    openGraph: {
      title: `${project.title} | ${siteName}`,
      description: project.summary
    }
  };
}

export default async function ProjectPage({ params }: ProjectPageProps) {
  const { slug } = await params;
  const project = getProjectCaseStudy(slug);

  if (!project) {
    notFound();
  }

  return <ProjectCaseStudyPage project={project} />;
}
