"use client";

import {
  contactLinks,
  githubProfileUrl,
  githubUsername,
  guestbookLabel,
  guestbookRepo,
  linkedinActivityUrl,
  linkedinProfileUrl
} from "@/content/site";

type GitHubProfile = {
  public_repos: number;
  followers: number;
  following: number;
  created_at: string;
  updated_at: string;
  html_url: string;
};

type GitHubRepo = {
  id: number;
  name: string;
  html_url: string;
  stargazers_count: number;
  fork: boolean;
  archived: boolean;
  pushed_at: string | null;
  homepage: string | null;
};

type GitHubEvent = {
  id: string;
  type: string;
  created_at: string;
  repo?: { name: string };
  payload?: {
    action?: string;
    ref_type?: string;
    ref?: string;
    commits?: Array<{ message: string }>;
    issue?: { title?: string };
    pull_request?: { title?: string };
    release?: { name?: string; tag_name?: string };
  };
};

type GitHubIssue = {
  id: number;
  title: string;
  body: string | null;
  comments: number;
  created_at: string;
  updated_at: string;
  html_url: string;
};

type LinkedInItem = {
  id?: string;
  title?: string;
  summary?: string;
  url?: string;
  publishedAt?: string;
  date?: string;
};

type LinkedInPayload = {
  items?: LinkedInItem[];
};

export interface SignalFeedItem {
  id: string;
  source: "GitHub" | "LinkedIn" | "Remarks";
  title: string;
  summary: string;
  href: string;
  timestamp: string;
  relativeTime: string;
}

export interface SignalMetric {
  label: string;
  value: string;
  note: string;
}

export interface SignalSnapshot {
  items: SignalFeedItem[];
  metrics: SignalMetric[];
  fetchedAt: string;
}

const GITHUB_HEADERS = {
  Accept: "application/vnd.github+json"
};

const DAY_IN_MS = 24 * 60 * 60 * 1000;

function trimText(text: string | null | undefined, maxLength = 150) {
  const clean = (text ?? "").replace(/\s+/g, " ").trim();

  if (!clean) {
    return "";
  }

  return clean.length > maxLength ? `${clean.slice(0, maxLength - 1).trimEnd()}…` : clean;
}

function formatRepoName(repoName: string | undefined) {
  const raw = repoName?.split("/").pop() ?? "repo";
  return raw.replace(/[-_]/g, " ");
}

function formatMetricValue(value: number) {
  return value < 100 ? String(value).padStart(2, "0") : String(value);
}

function isWithinDays(timestamp: string | null | undefined, days: number) {
  if (!timestamp) {
    return false;
  }

  return Date.now() - new Date(timestamp).getTime() < days * DAY_IN_MS;
}

export function formatRelativeTime(timestamp: string) {
  const diffMs = new Date(timestamp).getTime() - Date.now();
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const week = 7 * day;
  const month = 30 * day;
  const year = 365 * day;
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

  if (Math.abs(diffMs) < hour) {
    return formatter.format(Math.round(diffMs / minute), "minute");
  }

  if (Math.abs(diffMs) < day) {
    return formatter.format(Math.round(diffMs / hour), "hour");
  }

  if (Math.abs(diffMs) < week) {
    return formatter.format(Math.round(diffMs / day), "day");
  }

  if (Math.abs(diffMs) < month) {
    return formatter.format(Math.round(diffMs / week), "week");
  }

  if (Math.abs(diffMs) < year) {
    return formatter.format(Math.round(diffMs / month), "month");
  }

  return formatter.format(Math.round(diffMs / year), "year");
}

function mapGitHubEvent(event: GitHubEvent): SignalFeedItem | null {
  const repo = formatRepoName(event.repo?.name);
  const timestamp = event.created_at;
  const relativeTime = formatRelativeTime(timestamp);

  switch (event.type) {
    case "PushEvent": {
      const commitCount = event.payload?.commits?.length ?? 0;

      return {
        id: event.id,
        source: "GitHub",
        title: `Pushed ${commitCount || 1} update${commitCount === 1 ? "" : "s"} to ${repo}`,
        summary: trimText(event.payload?.commits?.[0]?.message, 120) || "Shipped another public code update.",
        href: event.repo?.name ? `https://github.com/${event.repo.name}` : githubProfileUrl,
        timestamp,
        relativeTime
      };
    }
    case "CreateEvent":
      return {
        id: event.id,
        source: "GitHub",
        title: `Opened a ${event.payload?.ref_type ?? "repo"} in ${repo}`,
        summary: trimText(event.payload?.ref, 120) || "A new branch or repository surface was created.",
        href: event.repo?.name ? `https://github.com/${event.repo.name}` : githubProfileUrl,
        timestamp,
        relativeTime
      };
    case "PullRequestEvent":
      return {
        id: event.id,
        source: "GitHub",
        title: `${event.payload?.action ?? "Updated"} a pull request in ${repo}`,
        summary: trimText(event.payload?.pull_request?.title, 120) || "Public review and iteration activity.",
        href: event.repo?.name ? `https://github.com/${event.repo.name}/pulls` : githubProfileUrl,
        timestamp,
        relativeTime
      };
    case "IssuesEvent":
      return {
        id: event.id,
        source: "GitHub",
        title: `${event.payload?.action ?? "Touched"} an issue in ${repo}`,
        summary: trimText(event.payload?.issue?.title, 120) || "Issue discussion or planning activity.",
        href: event.repo?.name ? `https://github.com/${event.repo.name}/issues` : githubProfileUrl,
        timestamp,
        relativeTime
      };
    case "IssueCommentEvent":
      return {
        id: event.id,
        source: "GitHub",
        title: `Left a public comment in ${repo}`,
        summary: trimText(event.payload?.issue?.title, 120) || "Conversation happening in public issues.",
        href: event.repo?.name ? `https://github.com/${event.repo.name}/issues` : githubProfileUrl,
        timestamp,
        relativeTime
      };
    case "ReleaseEvent":
      return {
        id: event.id,
        source: "GitHub",
        title: `Published a release for ${repo}`,
        summary:
          trimText(event.payload?.release?.name || event.payload?.release?.tag_name, 120) || "A public release went live.",
        href: event.repo?.name ? `https://github.com/${event.repo.name}/releases` : githubProfileUrl,
        timestamp,
        relativeTime
      };
    default:
      return null;
  }
}

async function fetchGitHubProfile(signal: AbortSignal) {
  const response = await fetch(`https://api.github.com/users/${githubUsername}`, {
    headers: GITHUB_HEADERS,
    signal
  });

  if (!response.ok) {
    throw new Error("Unable to fetch GitHub profile.");
  }

  return (await response.json()) as GitHubProfile;
}

async function fetchGitHubRepos(signal: AbortSignal) {
  const response = await fetch(`https://api.github.com/users/${githubUsername}/repos?per_page=100&sort=updated`, {
    headers: GITHUB_HEADERS,
    signal
  });

  if (!response.ok) {
    throw new Error("Unable to fetch GitHub repositories.");
  }

  return (await response.json()) as GitHubRepo[];
}

async function fetchGitHubEvents(signal: AbortSignal) {
  const response = await fetch(`https://api.github.com/users/${githubUsername}/events/public?per_page=20`, {
    headers: GITHUB_HEADERS,
    signal
  });

  if (!response.ok) {
    throw new Error("Unable to fetch GitHub activity.");
  }

  const events = (await response.json()) as GitHubEvent[];
  return events.map(mapGitHubEvent).filter((item): item is SignalFeedItem => Boolean(item));
}

async function fetchGuestbookNotes(signal: AbortSignal) {
  const response = await fetch(
    `https://api.github.com/repos/${guestbookRepo}/issues?labels=${guestbookLabel}&state=all&per_page=6`,
    {
      headers: GITHUB_HEADERS,
      signal
    }
  );

  if (!response.ok) {
    return [];
  }

  const issues = (await response.json()) as GitHubIssue[];

  return issues.map((issue) => ({
    id: `remark-${issue.id}`,
    source: "Remarks" as const,
    title: issue.title,
    summary:
      trimText(issue.body, 140) ||
      `${issue.comments} public repl${issue.comments === 1 ? "y" : "ies"} on the guestbook so far.`,
    href: issue.html_url,
    timestamp: issue.updated_at || issue.created_at,
    relativeTime: formatRelativeTime(issue.updated_at || issue.created_at)
  }));
}

async function fetchLinkedInActivity(signal: AbortSignal) {
  if (!linkedinActivityUrl) {
    return [];
  }

  const response = await fetch(linkedinActivityUrl, { signal });

  if (!response.ok) {
    return [];
  }

  const payload = (await response.json()) as LinkedInPayload | LinkedInItem[];
  const rawItems = Array.isArray(payload) ? payload : payload.items ?? [];

  return rawItems
    .filter((item): item is NonNullable<typeof item> => Boolean(item?.title && item?.url))
    .slice(0, 4)
    .map((item, index) => {
      const timestamp = item.publishedAt ?? item.date ?? new Date().toISOString();

      return {
        id: item.id ?? `linkedin-${index}`,
        source: "LinkedIn" as const,
        title: item.title ?? "LinkedIn update",
        summary: trimText(item.summary, 140) || "Public LinkedIn activity.",
        href: item.url ?? linkedinProfileUrl,
        timestamp,
        relativeTime: formatRelativeTime(timestamp)
      };
    });
}

function buildMetrics(profile: GitHubProfile | null, repos: GitHubRepo[], items: SignalFeedItem[]): SignalMetric[] {
  const nonForkRepos = repos.filter((repo) => !repo.fork);
  const updatedRepos90d = repos.filter((repo) => !repo.fork && !repo.archived && isWithinDays(repo.pushed_at, 90)).length;
  const signals30d = items.filter((item) => isWithinDays(item.timestamp, 30)).length;
  const liveDemoCount = contactLinks.filter((item) => item.availability === "Live demo").length;

  return [
    {
      label: "Public repos",
      value: formatMetricValue(profile?.public_repos ?? nonForkRepos.length),
      note: "Visible GitHub repositories attached to the public profile right now."
    },
    {
      label: "Repos touched in 90d",
      value: formatMetricValue(updatedRepos90d),
      note: "Non-archived repos with a public push during the last 90 days."
    },
    {
      label: "Signals in 30d",
      value: formatMetricValue(signals30d),
      note: "Public GitHub events, remarks, and linked posts visible in the last 30 days."
    },
    {
      label: "Live product doors",
      value: formatMetricValue(liveDemoCount),
      note: "Public product entry points currently linked from this portfolio."
    }
  ];
}

export async function fetchLiveSignalSnapshot(signal: AbortSignal): Promise<SignalSnapshot> {
  const [profileResult, reposResult, githubResult, remarksResult, linkedInResult] = await Promise.allSettled([
    fetchGitHubProfile(signal),
    fetchGitHubRepos(signal),
    fetchGitHubEvents(signal),
    fetchGuestbookNotes(signal),
    fetchLinkedInActivity(signal)
  ]);

  const repos = reposResult.status === "fulfilled" ? reposResult.value : [];
  const items = [githubResult, remarksResult, linkedInResult]
    .flatMap((result) => (result.status === "fulfilled" ? result.value : []))
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return {
    items: items.slice(0, 10),
    metrics: buildMetrics(profileResult.status === "fulfilled" ? profileResult.value : null, repos, items),
    fetchedAt: new Date().toISOString()
  };
}
