export type SectionId =
  | "hero"
  | "impact"
  | "featured-products"
  | "stack"
  | "experience"
  | "education"
  | "contact";

export interface NavigationItem {
  id: SectionId;
  label: string;
}

export interface ImpactMetric {
  value: string;
  label: string;
  context: string;
}

export interface SkillCluster {
  eyebrow: string;
  title: string;
  description: string;
  bullets: string[];
}

export interface ExperienceEntry {
  company: string;
  role: string;
  location: string;
  period: string;
  summary: string;
  bullets: string[];
}

export interface EducationEntry {
  institution: string;
  credential: string;
  location: string;
}

export interface CertificationEntry {
  title: string;
  issuer: string;
}

export interface ProjectLink {
  label: string;
  href: string;
  note: string;
}

export interface ArchitectureStep {
  label: string;
  title: string;
  summary: string;
  detail: string;
}

export interface ProjectCaseStudy {
  slug: string;
  shortTitle: string;
  title: string;
  kicker: string;
  productLabel: string;
  role: string;
  summary: string;
  heroStatement: string;
  statusLabel: string;
  problem: string;
  featuredBullets: string[];
  verifiedFeatures: string[];
  aiStack: string[];
  platformStack: string[];
  recruiterKeywords: string[];
  links: ProjectLink[];
  architecture: ArchitectureStep[];
}

export interface ContactLink {
  label: string;
  href: string | null;
  note: string;
  availability: string;
}

export interface CapabilityGroup {
  title: string;
  eyebrow: string;
  description: string;
  bullets: string[];
}

export interface BackboneItem {
  title: string;
  value: string;
  description: string;
}

export interface CareerPhase {
  title: string;
  period: string;
  summary: string;
  outcomes: string[];
}

export interface UpcomingTopic {
  title: string;
  summary: string;
}

export const siteName = "Akhielesh";
export const fullName = "Akhielesh Srirangam";
export const locationLabel = "Fairfax, VA";
export const roleTitle = "AI Product Engineer";
export const roleSubtitle =
  "Fairfax, VA based AI product engineer with a Python, data engineering, and analytics foundation across automation, search, and multi-model workflow systems.";
export const heroHeadline =
  "AI Product Engineer building search, automation, and multi-model workflow systems on top of a Python and data-platform foundation.";
export const heroSummary =
  "I build recruiter-legible systems with measurable outcomes: connector-aware AI products, workflow automation, data profiling platforms, and analytics surfaces that help teams act faster.";
export const introTitles = [
  "AI Product Engineer",
  "Python Automation Builder",
  "Search + Workflow Systems",
  "Data Platform Mindset"
];
export const siteDescription =
  "Portfolio for Akhielesh Srirangam, an AI Product Engineer in Fairfax, VA building AI search products, Python automation, data-platform workflows, and analytics systems.";
export const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://example.com";
export const githubUsername = "Akhielesh";
export const githubProfileUrl = "https://github.com/Akhielesh";
export const linkedinProfileUrl = "https://www.linkedin.com/in/akhielesh-srirangam-a2110471/";
export const emailAddress = "akhieleshsrirangam@gmail.com";
export const guestbookRepo = "Akhielesh/Akhielesh";
export const guestbookLabel = "portfolio-remark";
export const linkedinActivityUrl = process.env.NEXT_PUBLIC_LINKEDIN_ACTIVITY_URL ?? "";

export const navigation: NavigationItem[] = [
  { id: "hero", label: "Home" },
  { id: "impact", label: "Impact" },
  { id: "featured-products", label: "Products" },
  { id: "stack", label: "Stack" },
  { id: "experience", label: "Experience" },
  { id: "education", label: "Education" },
  { id: "contact", label: "Links" }
];

export const proofChips = [
  "Python automation",
  "Databricks + ADF",
  "AI search products",
  "Multi-model workflows",
  "Analytics engineering"
];

export const impactMetrics: ImpactMetric[] = [
  {
    value: "40%",
    label: "Faster reporting turnaround",
    context: "Spacewalk Systems PMO workflows spanning Jira, ServiceNow, and HR reporting."
  },
  {
    value: "~15 hrs/wk",
    label: "Manual status work removed",
    context: "Budget and schedule deviation workflows that replaced repetitive PMO checks."
  },
  {
    value: "60%",
    label: "Profiling report generation reduced",
    context: "GSK data quality framework automation built on Python, ADF, and Databricks."
  },
  {
    value: "98%",
    label: "Workflow success rate",
    context: "Validation checkpoints and retry logic added across automated profiling pipelines."
  },
  {
    value: "7+",
    label: "Business domains covered",
    context: "Automated visibility into data quality and metadata health across multiple business units."
  },
  {
    value: "25%",
    label: "Faster intake and delivery",
    context: "Jacobs Agile Demand Process standardization for IT portfolio requests."
  },
  {
    value: "30%",
    label: "Annual cost savings",
    context: "License optimization dashboards and SQL-backed software portfolio analytics at Jacobs."
  }
];

export const projectCaseStudies: ProjectCaseStudy[] = [
  {
    slug: "atlas-ai-search-workspace",
    shortTitle: "Atlas",
    title: "Atlas Beta / Connector-Aware AI Search Workspace",
    kicker: "Featured AI Product",
    productLabel: "AI search workspace",
    role: "Product, platform, and full-stack engineering",
    summary:
      "A search-first workspace that connects cloud tools, indexes what users authorize, and turns retrieval into a product surface with previews, collections, notifications, and operational clarity.",
    heroStatement:
      "Atlas focuses on retrieval, sensemaking, and traceability instead of vague AI claims: connect sources, search across them, inspect why results matter, and act with connector-aware boundaries.",
    statusLabel: "Live beta",
    problem:
      "Knowledge work is fragmented across file storage, messaging, docs, design, and project systems. Atlas tackles that fragmentation with a connector-aware search workspace that stays honest about coverage, freshness, and supported actions.",
    featuredBullets: [
      "Cross-source search is paired with previews, collections, analytics, and activity so users can understand results instead of just seeing a ranked list.",
      "The product distinguishes lean-beta and production-target runtime paths, showing real systems thinking around cost, search infrastructure, and background jobs.",
      "Connector behavior is explicit: Atlas exposes search coverage, supported actions, and source-specific limits rather than hiding them behind generic AI copy."
    ],
    verifiedFeatures: [
      "Multi-account OAuth connectors with source-aware access models across file storage, code, knowledge, messaging, design, and project tools.",
      "Cross-source search, previews, collections, notifications, activity, and analytics surfaces built around workspace retrieval and operational traceability.",
      "Lean-beta runtime with Postgres search and database-backed queue fallback, plus a production-target path using OpenSearch, Redis/BullMQ, and S3-oriented infrastructure.",
      "Connector adapters for Google Drive, Gmail, OneDrive, Dropbox, Box, GitHub, GitLab, Notion, Slack, Figma, Linear, Airtable, Teams, AWS S3, and Google Photos."
    ],
    aiStack: ["Query understanding", "Search ranking", "Context-aware retrieval", "Preview extraction", "Automation hooks"],
    platformStack: [
      "Next.js 14",
      "React 18",
      "TypeScript",
      "Prisma",
      "PostgreSQL",
      "BullMQ",
      "Redis",
      "Supabase",
      "S3-style artifact storage",
      "OpenSearch",
      "NextAuth",
      "Cloudflare",
      "Railway",
      "AWS-target architecture"
    ],
    recruiterKeywords: [
      "AI search",
      "retrieval systems",
      "connector architecture",
      "workflow automation",
      "full-stack TypeScript",
      "search infrastructure",
      "background jobs",
      "product systems"
    ],
    links: [
      {
        label: "Live demo",
        href: "https://atlasd-production.up.railway.app",
        note: "Deployed beta workspace with live connector coverage and search surfaces."
      },
      {
        label: "Source",
        href: "https://github.com/Akhielesh/AtlasD",
        note: "Next.js codebase, connector adapters, runtime modes, and platform planning docs."
      }
    ],
    architecture: [
      {
        label: "Retrieval",
        title: "Search-first workspace",
        summary: "Indexed retrieval, previews, and collections are treated as the primary product loop.",
        detail:
          "Atlas is designed around finding, understanding, and acting on connected content without pretending everything is an autonomous agent workflow."
      },
      {
        label: "Connectors",
        title: "Source-aware adapter model",
        summary: "Each connector exposes its own coverage, capabilities, and operational truth model.",
        detail:
          "That makes the product legible for users and safer to expand as more providers and entity types come online."
      },
      {
        label: "Platform",
        title: "Beta to production path",
        summary: "Lean beta economics are preserved while the architecture stays ready for OpenSearch, Redis/BullMQ, and S3-backed scale.",
        detail:
          "The product documents a practical migration path instead of hard-coding expensive infrastructure too early."
      }
    ]
  },
  {
    slug: "dreamstream-comic-studio",
    shortTitle: "DreamStream",
    title: "DreamStream Comic Studio / Multi-Model Creation Workflow",
    kicker: "Featured AI Product",
    productLabel: "AI content workflow platform",
    role: "Product, frontend, backend, and workflow orchestration",
    summary:
      "A staged AI comic production platform that turns scripts into structured generation flows with world extraction, style control, storyboard planning, queue-backed ComicForge jobs, QC, export, and token-aware billing.",
    heroStatement:
      "DreamStream treats image generation as one step inside a larger workflow system: analyze the script, shape the world, control style and layout, run queued generation jobs, review quality, and export a usable final output.",
    statusLabel: "Live product build",
    problem:
      "Most AI creative tools stop at one-click generation. DreamStream addresses the harder product problem: how to give users control over story structure, character consistency, layout, billing, and delivery across a full creation pipeline.",
    featuredBullets: [
      "The app separates script analysis, world building, style selection, storyboard, generation, QC, and export so the workflow stays understandable.",
      "ComicForge adds a queue-backed production layer for generation, lettering, assembly, QC, and export instead of relying on a single synchronous demo path.",
      "The platform includes BYOK model routing, billing controls, auth, storage, and job-state tracking so the AI workflow behaves like a real product."
    ],
    verifiedFeatures: [
      "AI-assisted script analysis, world extraction, story architecture, style recommendation, layout guidance, and storyboard preparation.",
      "Reference and generation flows backed by Gemini text/image paths, Flux image generation, and local model-key routing for BYOK settings.",
      "Queue-backed ComicForge pipeline for generation jobs, QC, lettering, assembly, export, and job-status tracking.",
      "Supabase-backed auth/storage flows, Stripe billing, token-based usage controls, and settings for image providers and model selection."
    ],
    aiStack: [
      "Gemini text workflows",
      "Gemini image generation",
      "Flux image generation",
      "Prompt routing",
      "World extraction",
      "Story architecture",
      "QC workflows"
    ],
    platformStack: [
      "Vite",
      "React 19",
      "TypeScript",
      "Express",
      "Supabase",
      "Stripe",
      "BullMQ",
      "Redis",
      "Zustand",
      "sharp"
    ],
    recruiterKeywords: [
      "multi-model workflows",
      "AI product UX",
      "job orchestration",
      "billing systems",
      "queue-backed pipelines",
      "full-stack TypeScript",
      "creative AI products"
    ],
    links: [
      {
        label: "Live demo",
        href: "https://comic2.pages.dev/",
        note: "Public DreamStream Comic Studio deployment."
      },
      {
        label: "Source",
        href: "https://github.com/Akhielesh/Comic2/tree/Dreamstrream-v1/dreamstreamcomicstudio",
        note: "Frontend, backend, ComicForge pipeline, and production-hardening docs."
      }
    ],
    architecture: [
      {
        label: "Workflow",
        title: "Stage-based product flow",
        summary: "From script input to export, each phase has a clear role, state, and approval surface.",
        detail:
          "That product structure keeps the system understandable for users and easier to evolve than a one-button generation interface."
      },
      {
        label: "Models",
        title: "Multi-model routing with BYOK",
        summary: "Text and image tasks can route through Gemini and Flux paths with user-configurable key handling.",
        detail:
          "The result is a product that exposes model choice and cost controls without collapsing into raw provider jargon."
      },
      {
        label: "Operations",
        title: "ComicForge job pipeline",
        summary: "BullMQ, Redis, and backend job orchestration support generation, QC, lettering, assembly, and export flows.",
        detail:
          "This is productized workflow automation, not just a client-side wrapper around an image endpoint."
      }
    ]
  }
];

export const skillClusters: SkillCluster[] = [
  {
    eyebrow: "AI Products & Workflows",
    title: "Search, orchestration, and product flows that make AI systems usable",
    description:
      "The strongest portfolio signal is not isolated model usage. It is building product systems that combine retrieval, prompts, jobs, state, and user-facing control surfaces.",
    bullets: [
      "AI search and retrieval workflows",
      "Multi-model routing and tool integration",
      "Background jobs, queue-backed pipelines, and workflow state",
      "User-facing interfaces that explain AI behavior"
    ]
  },
  {
    eyebrow: "Data & Automation",
    title: "Python and data-platform engineering behind reliable automation",
    description:
      "Resume-backed experience in Python, SQL, Databricks, Azure Data Factory, ETL pipelines, validation, profiling, and reusable reporting automation.",
    bullets: [
      "Python with Pandas, NumPy, and automation scripts",
      "Databricks notebooks and ADF orchestration",
      "ETL, validation checkpoints, retry logic, and data profiling",
      "Metadata, data quality, and operational reporting"
    ]
  },
  {
    eyebrow: "Cloud & Platform",
    title: "Cloud-supported application and data systems",
    description:
      "The portfolio combines application-layer product work with practical platform choices across auth, storage, search, jobs, and cloud environments.",
    bullets: [
      "Azure data and workflow tooling",
      "AWS cloud fundamentals and storage/search concepts",
      "Supabase, PostgreSQL, Redis, S3-style storage, and auth flows",
      "Deployment thinking across lean beta and production-target architectures"
    ]
  },
  {
    eyebrow: "Analytics & Decisioning",
    title: "Dashboards, KPI reporting, and visibility into business operations",
    description:
      "A strong analytics foundation shows up in both resume work and product work: Power BI dashboards, ThoughtSpot, Tableau, executive reporting, and observability-minded product surfaces.",
    bullets: [
      "Power BI, Tableau, and ThoughtSpot",
      "Executive dashboards and KPI automation",
      "Operational analytics and portfolio reporting",
      "Decision-support systems for PMO and leadership use"
    ]
  }
];

export const experienceEntries: ExperienceEntry[] = [
  {
    company: "Spacewalk Systems",
    role: "Data Analyst",
    location: "Arlington, VA",
    period: "Mar 2025 - Dec 2025",
    summary:
      "Built PMO reporting workflows and dashboard systems that combined Python, SQL, Azure Data Factory, and Power BI for executive portfolio visibility.",
    bullets: [
      "Engineered Python- and SQL-driven workflows across Jira, ServiceNow, and HR data, cutting reporting turnaround time by 40%.",
      "Designed automated budget and timeline deviation alerts that removed manual status checks and saved the PMO team about 15 hours per week.",
      "Delivered executive-ready dashboards and ad hoc portfolio analysis for resource utilization, burn rate monitoring, and quarterly reviews."
    ]
  },
  {
    company: "GSK (Contract)",
    role: "Data Analyst",
    location: "Collegeville, PA",
    period: "Jun 2023 - Dec 2024",
    summary:
      "Built reusable data profiling and ETL automation on Azure Data Factory, Databricks, Python, and Power BI for enterprise data quality reporting.",
    bullets: [
      "Designed automated ETL pipelines in ADF and Databricks and packaged a customized Python profiler for SQL, CSV, Blob, Oracle, and MySQL data sources.",
      "Integrated validation checkpoints, retries, and notification logic, reaching a 98% workflow success rate across profiling and ingestion runs.",
      "Reduced profiling report generation time by 60% and expanded automated DQ visibility across 7+ business domains through leadership dashboards."
    ]
  },
  {
    company: "Jacobs Engineering Group Inc.",
    role: "IT Analyst / Data Automation Intern",
    location: "Arlington, VA",
    period: "Aug 2022 - May 2023",
    summary:
      "Supported IT portfolio analytics through Python log parsing, SQL-backed ETL, Power BI dashboards, and process standardization for demand intake and workforce planning.",
    bullets: [
      "Automated log parsing and ETL scripts to move unstructured operational data into structured reporting tables and dashboard feeds.",
      "Standardized the Agile Demand Process and improved IT portfolio request delivery time by 25% through clearer workflow design.",
      "Built software utilization and license-cost dashboards that informed purchasing decisions and contributed to 30% annual cost savings."
    ]
  },
  {
    company: "Alphadynamcis",
    role: "Product Research Analyst Intern",
    location: "Chennai, India",
    period: "Jul 2020 - Sep 2020",
    summary:
      "Produced client-facing research and reporting for educational product organizations, combining remote collaboration, analysis, and presentation support.",
    bullets: [
      "Generated Tableau-based reports that supported customer lead generation and product visibility for education-focused clients.",
      "Collaborated remotely under short deadlines to prepare reports and presentation material for client meetings.",
      "Analyzed product performance and assisted with cloud and system support tasks in VMware-centered environments."
    ]
  }
];

export const educationEntries: EducationEntry[] = [
  {
    institution: "The George Washington University, School of Business",
    credential: "Master of Science in Information Systems Technology",
    location: "Washington, DC, USA"
  },
  {
    institution: "The George Washington University, School of Business",
    credential: "Graduate Certificate in Cloud Applications and IT",
    location: "Washington, DC, USA"
  },
  {
    institution: "SRM Institute of Science and Technology",
    credential: "Bachelor of Technology in Computer Science Engineering",
    location: "Chennai, India"
  }
];

export const certificationEntries: CertificationEntry[] = [
  {
    title: "ThoughtSpot BI Professional",
    issuer: "ThoughtSpot"
  },
  {
    title: "Machine Learning Specialization",
    issuer: "Stanford University / Coursera"
  },
  {
    title: "AWS Certified Cloud Practitioner",
    issuer: "Amazon Web Services"
  }
];

export const contactLinks: ContactLink[] = [
  {
    label: "LinkedIn",
    href: linkedinProfileUrl,
    note: "Role history, certifications, and professional background.",
    availability: "Public profile"
  },
  {
    label: "GitHub",
    href: githubProfileUrl,
    note: "Source code for Atlas, DreamStream, and portfolio work.",
    availability: "Public profile"
  },
  {
    label: "Email",
    href: `mailto:${emailAddress}`,
    note: "Direct contact for AI product, Python automation, and platform roles.",
    availability: "Direct contact"
  },
  {
    label: "Atlas demo",
    href: "https://atlasd-production.up.railway.app",
    note: "Live beta for the connector-aware AI search workspace.",
    availability: "Live demo"
  },
  {
    label: "DreamStream demo",
    href: "https://comic2.pages.dev/",
    note: "Live product build for DreamStream Comic Studio.",
    availability: "Live demo"
  }
];

export const capabilityGroups: CapabilityGroup[] = skillClusters;

export const backboneItems: BackboneItem[] = [
  {
    title: "Primary languages",
    value: "Python + SQL",
    description: "Used for ETL, profiling, reporting automation, and data-backed analytics workflows."
  },
  {
    title: "Pipeline tooling",
    value: "Databricks + ADF",
    description: "Practical experience shipping orchestrated data workflows, scheduling, retries, and validation."
  },
  {
    title: "Analytics",
    value: "Power BI / Tableau / ThoughtSpot",
    description: "Executive dashboards, KPI reporting, and decision-support surfaces built for operational clarity."
  },
  {
    title: "Platform stack",
    value: "Postgres / Redis / Supabase",
    description: "Application and data infrastructure choices that support modern AI product delivery."
  }
];

export const careerPhases: CareerPhase[] = experienceEntries.map((entry) => ({
  title: `${entry.company} - ${entry.role}`,
  period: entry.period,
  summary: `${entry.location} • ${entry.summary}`,
  outcomes: entry.bullets
}));

export const upcomingTopics: UpcomingTopic[] = [];

export function getProjectCaseStudy(slug: string) {
  return projectCaseStudies.find((project) => project.slug === slug);
}
