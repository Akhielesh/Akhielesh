export type SectionId =
  | "hero"
  | "featured-ai-products"
  | "systems-capabilities"
  | "data-backbone"
  | "career"
  | "writing"
  | "contact";

export type ArchitectureLabel = "Problem" | "Workflow" | "Models" | "Connectors" | "UX";

export interface ArchitectureStep {
  label: ArchitectureLabel;
  title: string;
  summary: string;
  detail: string;
}

export type CaseStudySectionTitle =
  | "Problem"
  | "Product idea"
  | "Workflow / system design"
  | "Key technical decisions"
  | "Models / tools used"
  | "UI/UX thinking"
  | "Deployment / architecture notes"
  | "Outcome / current status";

export interface ProjectCaseStudySection {
  title: CaseStudySectionTitle;
  paragraphs: string[];
}

export interface ProjectCaseStudy {
  slug: string;
  shortTitle: string;
  title: string;
  kicker: string;
  summary: string;
  heroStatement: string;
  status: string;
  tags: string[];
  featuredBullets: string[];
  architecture: ArchitectureStep[];
  stack: string[];
  deliverables: string[];
  sections: ProjectCaseStudySection[];
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

export interface ContactLink {
  label: string;
  href: string | null;
  note: string;
  availability: string;
}

export const siteName = "Akhielesh";
export const roleTitle = "AI Product Engineer";
export const roleSubtitle =
  "Building multi-model AI products, agentic workflows, connectors, and data-rich user experiences.";
export const brandTest =
  "A product-minded AI engineer with a strong data systems foundation who builds and ships usable AI experiences.";
export const siteDescription =
  "Portfolio for an AI Product Engineer focused on multi-model products, agentic workflows, connectors, and data-backed interfaces.";
export const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://example.com";

export const navigation: Array<{ id: SectionId; label: string }> = [
  { id: "hero", label: "Home" },
  { id: "featured-ai-products", label: "AI Products" },
  { id: "systems-capabilities", label: "Systems" },
  { id: "data-backbone", label: "Data Backbone" },
  { id: "career", label: "Career" },
  { id: "writing", label: "Writing" },
  { id: "contact", label: "Links" }
];

export const proofChips = [
  "Agents & tool calling",
  "Multi-model AI workflows",
  "Data + UI product systems"
];

export const projectCaseStudies: ProjectCaseStudy[] = [
  {
    slug: "atlas-search-terminal",
    shortTitle: "Atlas",
    title: "Atlas / AI Search Terminal",
    kicker: "Featured AI Product",
    summary:
      "A connector-aware search product that turns scattered workspace knowledge into a calmer, more usable AI retrieval experience.",
    heroStatement:
      "Atlas reframes search as a product surface: connect sources, shape retrieval, organize findings, and make the search layer feel operational instead of invisible.",
    status: "Working product shell with search, collections, connector APIs, and analytics surfaces.",
    tags: ["AI Search", "Connectors", "Product UX", "Collections", "Analytics"],
    featuredBullets: [
      "Connectors and sync flows are treated as part of the product, not hidden backend plumbing.",
      "Collections and analytics make retrieval behavior legible to users, not just accurate in logs.",
      "The interface stays calm and operational while still exposing search intelligence."
    ],
    architecture: [
      {
        label: "Problem",
        title: "Search was fragmented",
        summary: "Documents lived across workspace silos with inconsistent metadata and no unified search layer.",
        detail:
          "The product case study centers on reducing the friction between scattered knowledge sources and the people trying to query them."
      },
      {
        label: "Workflow",
        title: "Connector-to-collection loop",
        summary: "Users connect sources, sync documents, search in natural language, and collect important results.",
        detail:
          "Atlas pairs connector onboarding, search, previews, and collection management so retrieval becomes a reusable workflow."
      },
      {
        label: "Models",
        title: "AI-assisted retrieval shaping",
        summary: "Search suggestions and result framing are positioned as product-level intelligence instead of background magic.",
        detail:
          "The case study focuses on how AI search should feel in product terms: clear, trustworthy, and useful enough to drive action."
      },
      {
        label: "Connectors",
        title: "Source-aware access model",
        summary: "Google Drive is represented in code paths, with additional connector surfaces structured for broader workspace coverage.",
        detail:
          "Connector work is shown as permissions, sync, and trust design, not merely API wiring."
      },
      {
        label: "UX",
        title: "Calm interface for a noisy problem",
        summary: "The product leans on command surfaces, document previews, analytics, and collections instead of dashboard clutter.",
        detail:
          "Atlas is presented as an AI-first product that still respects product taste and user orientation."
      }
    ],
    stack: [
      "Next.js App Router",
      "TypeScript",
      "Tailwind + shadcn/ui patterns",
      "Connector APIs",
      "Server-side state",
      "Analytics surfaces"
    ],
    deliverables: ["Search experience", "Connector flows", "Collections model", "Analytics UI"],
    sections: [
      {
        title: "Problem",
        paragraphs: [
          "Search quality alone does not solve the workplace retrieval problem. Users still need a credible way to connect sources, understand what is indexed, and move from search results to usable action.",
          "Atlas is framed around that broader product problem: knowledge is scattered across connectors, permissions matter, and the interface needs to make the system legible."
        ]
      },
      {
        title: "Product idea",
        paragraphs: [
          "Build an AI search terminal that treats connectors, sync state, search, collections, and analytics as one product system.",
          "The product is not just a search box. It is the operational layer around retrieval: what is connected, what can be searched, what is worth saving, and what search behavior is telling you."
        ]
      },
      {
        title: "Workflow / system design",
        paragraphs: [
          "The nearby Atlas codebase already shows the product shape clearly: connector adapters, search routes, collection routes, analytics routes, and workspace data models.",
          "This portfolio version presents that as a coherent user workflow: connect a source, sync it, search with context, inspect results, and turn useful results into collections."
        ]
      },
      {
        title: "Key technical decisions",
        paragraphs: [
          "The case study emphasizes source-aware product behavior rather than overclaiming hidden intelligence. Connector state, collections, and analytics are first-class because they affect trust and usability.",
          "Interface decisions favor clarity over novelty: calm layout, visible system edges, and obvious transitions between search, preview, and organization."
        ]
      },
      {
        title: "Models / tools used",
        paragraphs: [
          "The product narrative centers on AI-assisted retrieval, search suggestions, and result framing layered onto a Next.js product shell.",
          "Connectors and analytics are treated as equally important tools because a search product fails if the system around the model is weak."
        ]
      },
      {
        title: "UI/UX thinking",
        paragraphs: [
          "Atlas is positioned as a serious AI product, not a speculative demo. The interface should feel calm, directional, and operational.",
          "Command surfaces, previews, collection states, and search intelligence help users understand what the system is doing without overwhelming them with dashboard noise."
        ]
      },
      {
        title: "Deployment / architecture notes",
        paragraphs: [
          "The reference implementation uses a Next.js application structure with API routes and connector adapters. That makes it a strong case study for productizing AI search inside a modern web stack.",
          "In portfolio form, the project highlights how product structure, connector logic, and analytics thinking fit together."
        ]
      },
      {
        title: "Outcome / current status",
        paragraphs: [
          "Atlas currently reads as a serious product shell with search, collection management, connector code paths, and analytics surfaces in place.",
          "The portfolio site treats it as evidence of AI product judgment: not just model usage, but how to make retrieval workflows usable and credible."
        ]
      }
    ]
  },
  {
    slug: "comicforge-ai-studio",
    shortTitle: "ComicForge",
    title: "AI Comic Generation System",
    kicker: "Featured AI Product",
    summary:
      "A stage-gated comic production studio that coordinates multi-model generation, worker services, QC, and export into a usable end-to-end product flow.",
    heroStatement:
      "ComicForge treats image generation as one stage in a larger production system, with UX and orchestration built to carry a project from idea to export.",
    status: "Working monorepo with web, API, queue-based workers, QC, and export flows.",
    tags: ["Multi-model", "Pipeline Design", "Workers", "Stage Gates", "Export"],
    featuredBullets: [
      "The user-facing workflow is broken into explicit stages instead of collapsing everything into one generation button.",
      "API, worker, and storage layers are arranged around production throughput rather than demo convenience.",
      "Quality tiers, stage guards, QC, and export make the product feel operational."
    ],
    architecture: [
      {
        label: "Problem",
        title: "Generation alone was not enough",
        summary: "Comic workflows break down when script, layout, image generation, lettering, QC, and export stay manual.",
        detail:
          "The case study positions AI as one component inside a larger production pipeline that still needs structure and user guidance."
      },
      {
        label: "Workflow",
        title: "Stage-gated production rail",
        summary: "Projects move through setup, script, architecture, style, assets, layout, storyboard, preview, generate, QC, and export.",
        detail:
          "That explicit rail is a product decision: it reduces ambiguity, prevents skipped prerequisites, and keeps the system understandable."
      },
      {
        label: "Models",
        title: "Quality-aware generation paths",
        summary: "Generation routes are sensitive to quality tiers and model routing rather than treating every job as the same.",
        detail:
          "The product shows how multi-model systems can stay user-comprehensible when the UX exposes stages, not raw provider complexity."
      },
      {
        label: "Connectors",
        title: "Web, API, queues, and workers",
        summary: "The system spans a Next.js frontend, FastAPI backend, Celery workers, Redis queues, MinIO storage, and a Node worker.",
        detail:
          "This is orchestration work with real surface area, not a single-page wrapper around an image endpoint."
      },
      {
        label: "UX",
        title: "Production workflow made usable",
        summary: "Stage rails, job states, and structured project pages turn a complex backend into a navigable studio experience.",
        detail:
          "The product case study highlights the interface discipline needed to make AI systems usable over time."
      }
    ],
    stack: [
      "Next.js 14 frontend",
      "FastAPI",
      "Celery",
      "Redis",
      "MinIO",
      "Node worker",
      "OpenAPI client"
    ],
    deliverables: ["Stage-gated UX", "Model routing", "QC flow", "Export pipeline"],
    sections: [
      {
        title: "Problem",
        paragraphs: [
          "Most AI comic tools stop at image generation. They do not solve the broader production workflow around scripting, layout, refinement, quality control, and export.",
          "ComicForge is interesting because it treats the whole pipeline as the product, not just the model call."
        ]
      },
      {
        title: "Product idea",
        paragraphs: [
          "Build a studio that lets users move a comic project through clearly defined stages, with generation, QC, and export built into the flow.",
          "The product value comes from orchestration and usability: users can choose paths, understand state, and move a project forward without losing the thread."
        ]
      },
      {
        title: "Workflow / system design",
        paragraphs: [
          "The repository already captures the shape: a web app, a FastAPI backend, a Node worker, queue-based task execution, and stage-specific screens across the project lifecycle.",
          "That structure becomes the core story of the case study: AI generation is embedded in a product pipeline with explicit handoffs and safeguards."
        ]
      },
      {
        title: "Key technical decisions",
        paragraphs: [
          "The strongest product decision is the stage-gated rail. It imposes sequence where the workflow needs it, which makes the system safer and more understandable.",
          "Separating web, API, and worker concerns also makes the pipeline easier to scale and reason about than a monolithic demo app."
        ]
      },
      {
        title: "Models / tools used",
        paragraphs: [
          "ComicForge uses multi-model thinking, quality tiers, prompt construction, image tasks, QC tasks, and export tasks.",
          "The important point is not just model variety. It is how these tools are orchestrated behind a product flow users can actually navigate."
        ]
      },
      {
        title: "UI/UX thinking",
        paragraphs: [
          "The interface organizes complexity through explicit stages, project context, and job feedback. That reduces the typical AI-tool feeling of hidden state and abrupt failure.",
          "The product is strongest when the UX communicates progress, prerequisites, and next actions without needing users to understand the backend."
        ]
      },
      {
        title: "Deployment / architecture notes",
        paragraphs: [
          "The monorepo structure, Docker setup, queue topology, and generated client all make this a useful case study for AI product architecture, not just frontend polish.",
          "It demonstrates comfort with combining typed interfaces, background work, and asset handling in a single shipped system."
        ]
      },
      {
        title: "Outcome / current status",
        paragraphs: [
          "ComicForge stands up as a serious multi-model product concept because the pipeline, stage guards, and export paths are already represented in code.",
          "On the portfolio site, it functions as proof of orchestration ability: product UX, backend services, and AI generation working as one system."
        ]
      }
    ]
  }
];

export const capabilityGroups: CapabilityGroup[] = [
  {
    eyebrow: "Agentic product thinking",
    title: "Designing AI around workflows, not one-off prompts",
    description:
      "The strongest products here are built around state, stages, and decision points so the model becomes part of a usable system.",
    bullets: [
      "Prompt workflows that stay legible in product form",
      "Tool calling and system surfaces that reduce hidden state",
      "Interfaces designed around next-step clarity"
    ]
  },
  {
    eyebrow: "Multi-model systems",
    title: "Choosing orchestration patterns that match the job",
    description:
      "Different product surfaces need different generation paths, quality levels, and routing logic. The system design should expose that without overwhelming the user.",
    bullets: [
      "Quality-aware generation paths",
      "Stage-aware model routing",
      "Separation between product UX and provider complexity"
    ]
  },
  {
    eyebrow: "Connectors and tools",
    title: "Treating connectors as product features",
    description:
      "Connectors, sync state, permissions, and external data access shape trust in AI products as much as the model output does.",
    bullets: [
      "Connector onboarding and sync surfaces",
      "Tool integration that supports real user tasks",
      "Operational visibility for search and generation systems"
    ]
  },
  {
    eyebrow: "Shipping discipline",
    title: "From system shape to shippable interface",
    description:
      "The throughline is practical delivery: interfaces, backend structure, deployment thinking, and enough product taste to make the system feel intentional.",
    bullets: [
      "Responsive, product-forward UI systems",
      "Deployment-ready application structure",
      "Data-backed interaction design"
    ]
  }
];

export const backboneItems: BackboneItem[] = [
  {
    title: "Cloud foundation",
    value: "Azure",
    description: "Comfort with cloud-hosted product systems and the operational layer behind internal and customer-facing tools."
  },
  {
    title: "Data platform work",
    value: "Databricks",
    description: "Experience with data-intensive workflows that inform how AI products should handle structure, scale, and reliability."
  },
  {
    title: "Pipelines",
    value: "ETL",
    description: "Pipeline thinking carries into AI products through ingestion, shaping, enrichment, and controlled handoffs between stages."
  },
  {
    title: "Decision surfaces",
    value: "BI / Dashboards",
    description: "Analytics and dashboard experience strengthens the ability to make AI systems observable and useful in real product contexts."
  },
  {
    title: "Metadata rigor",
    value: "Profiling / Lineage",
    description: "Understanding data provenance helps when search, connectors, and AI outputs need trust, explainability, and operational clarity."
  },
  {
    title: "Automation mindset",
    value: "Ops + orchestration",
    description: "Automation and systems thinking support faster iteration on both AI products and the delivery pipeline around them."
  }
];

export const careerPhases: CareerPhase[] = [
  {
    title: "Current focus",
    period: "AI Product Engineering",
    summary:
      "Building AI-first products where orchestration, interfaces, and system clarity matter as much as the model itself.",
    outcomes: [
      "Productized AI search and connector workflows",
      "Multi-stage generation systems with real UX structure",
      "Delivery patterns shaped around usable AI behavior"
    ]
  },
  {
    title: "Technical backbone",
    period: "Data Systems & Analytics",
    summary:
      "A data engineering and analytics base strengthens the way product decisions are made, instrumented, and operationalized.",
    outcomes: [
      "ETL and data movement habits",
      "BI and dashboard thinking",
      "Metadata, profiling, and observability awareness"
    ]
  },
  {
    title: "Working style",
    period: "Shipping mindset",
    summary:
      "The common thread is turning complex technical capability into products people can actually use.",
    outcomes: [
      "Product-first framing instead of model-first novelty",
      "Comfort across UI, backend, and deployment layers",
      "Bias toward systems that can be shipped and iterated"
    ]
  }
];

export const upcomingTopics: UpcomingTopic[] = [
  {
    title: "What makes an AI product feel usable",
    summary: "On why orchestration, state, and interface trust matter more than novelty."
  },
  {
    title: "Connectors are product design",
    summary: "How source access, sync state, and permissions shape credibility in AI search."
  },
  {
    title: "Designing stage-gated AI workflows",
    summary: "When explicit sequence improves outcomes in complex generation tools."
  },
  {
    title: "Why data systems still matter in AI products",
    summary: "How ETL, BI, and lineage habits improve product quality when models enter the stack."
  }
];

export const contactLinks: ContactLink[] = [
  {
    label: "LinkedIn",
    href: null,
    note: "Professional profile slot for role history and current focus.",
    availability: "Add public URL"
  },
  {
    label: "GitHub",
    href: null,
    note: "Repository and build trail for product work and experiments.",
    availability: "Add public URL"
  },
  {
    label: "Resume",
    href: null,
    note: "Compact version of experience, projects, and technical depth.",
    availability: "Add file or URL"
  },
  {
    label: "Email",
    href: null,
    note: "Direct contact point for product, AI, and platform conversations.",
    availability: "Add mailto link"
  },
  {
    label: "Live demos",
    href: null,
    note: "Optional demo links for products when they are ready to share publicly.",
    availability: "Add selected links"
  }
];

export function getProjectCaseStudy(slug: string) {
  return projectCaseStudies.find((project) => project.slug === slug);
}
