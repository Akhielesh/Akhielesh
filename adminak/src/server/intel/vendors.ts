import type { Category } from "../../shared/types.js";

export type VendorKind =
  | "streaming"
  | "music"
  | "gaming"
  | "news"
  | "education"
  | "fitness"
  | "software"
  | "ai"
  | "cloud"
  | "storage"
  | "productivity"
  | "dev"
  | "domain"
  | "vpn"
  | "bank"
  | "card"
  | "investing"
  | "crypto"
  | "payments"
  | "payroll"
  | "tax"
  | "credit"
  | "utility"
  | "telecom"
  | "internet"
  | "insurance"
  | "rent"
  | "loan"
  | "shopping"
  | "food"
  | "grocery"
  | "carrier"
  | "airline"
  | "hotel"
  | "travel"
  | "transport"
  | "car_rental"
  | "jobs"
  | "ats"
  | "assessment"
  | "social"
  | "identity"
  | "health"
  | "events"
  | "restaurant"
  | "newsletter"
  | "processor"
  | "marketplace";

export interface VendorProduct {
  key: string;
  name: string;
  pattern: RegExp;
  manageUrl?: string;
  kind?: VendorKind;
}

export interface VendorDef {
  slug: string;
  name: string;
  domains: string[];
  kind: VendorKind;
  category: Category;
  manageUrl?: string;
  color?: string;
  aliases?: string[];
  products?: VendorProduct[];
  /** Sends receipts on behalf of other merchants (Stripe, PayPal, Paddle, App Store…). */
  processor?: boolean;
}

export const KIND_CATEGORY: Record<VendorKind, Category> = {
  streaming: "subscriptions",
  music: "subscriptions",
  gaming: "subscriptions",
  news: "subscriptions",
  education: "subscriptions",
  fitness: "subscriptions",
  software: "subscriptions",
  ai: "subscriptions",
  cloud: "subscriptions",
  storage: "subscriptions",
  productivity: "subscriptions",
  dev: "subscriptions",
  domain: "subscriptions",
  vpn: "subscriptions",
  bank: "finance",
  card: "finance",
  investing: "finance",
  crypto: "finance",
  payments: "finance",
  payroll: "finance",
  tax: "finance",
  credit: "finance",
  utility: "bills",
  telecom: "bills",
  internet: "bills",
  insurance: "bills",
  rent: "bills",
  loan: "bills",
  shopping: "orders",
  food: "orders",
  grocery: "orders",
  carrier: "orders",
  marketplace: "orders",
  airline: "travel",
  hotel: "travel",
  travel: "travel",
  transport: "travel",
  car_rental: "travel",
  jobs: "career",
  ats: "career",
  assessment: "career",
  social: "social",
  identity: "security",
  health: "health",
  events: "events",
  restaurant: "events",
  newsletter: "newsletters",
  processor: "finance",
};

type Extra = Partial<Omit<VendorDef, "slug" | "name" | "domains" | "kind" | "category">> & { category?: Category };

function v(slug: string, name: string, domains: string[], kind: VendorKind, extra: Extra = {}): VendorDef {
  return { slug, name, domains, kind, category: extra.category ?? KIND_CATEGORY[kind], ...extra };
}

export const VENDORS: VendorDef[] = [
  // ── Streaming & entertainment ───────────────────────────────────────────────
  v("netflix", "Netflix", ["netflix.com"], "streaming", { manageUrl: "https://www.netflix.com/account", color: "#e50914" }),
  v("spotify", "Spotify", ["spotify.com"], "music", { manageUrl: "https://www.spotify.com/account/subscription/", color: "#1db954" }),
  v("disney-plus", "Disney+", ["disneyplus.com", "disney.com", "mail.disneyplus.com"], "streaming", { manageUrl: "https://www.disneyplus.com/account", color: "#113ccf", aliases: ["disney+", "disney plus"] }),
  v("hulu", "Hulu", ["hulu.com"], "streaming", { manageUrl: "https://secure.hulu.com/account", color: "#1ce783" }),
  v("max", "Max", ["max.com", "hbomax.com"], "streaming", { manageUrl: "https://auth.max.com/subscription", color: "#002be7", aliases: ["hbo max"] }),
  v("paramount-plus", "Paramount+", ["paramountplus.com"], "streaming", { manageUrl: "https://www.paramountplus.com/account/", color: "#0064ff" }),
  v("peacock", "Peacock", ["peacocktv.com"], "streaming", { manageUrl: "https://www.peacocktv.com/account/plans", color: "#000000" }),
  v("apple-tv", "Apple TV+", ["tv.apple.com"], "streaming", { color: "#000000" }),
  v("crunchyroll", "Crunchyroll", ["crunchyroll.com"], "streaming", { manageUrl: "https://www.crunchyroll.com/account/membership", color: "#f47521" }),
  v("youtube-tv", "YouTube TV", ["tv.youtube.com"], "streaming", { manageUrl: "https://tv.youtube.com/settings/membership", color: "#ff0000" }),
  v("sling", "Sling TV", ["sling.com"], "streaming", { color: "#0072ce" }),
  v("espn-plus", "ESPN+", ["espn.com", "espnplus.com"], "streaming", { color: "#d00" }),
  v("dazn", "DAZN", ["dazn.com"], "streaming"),
  v("fubo", "Fubo", ["fubo.tv"], "streaming"),
  v("twitch", "Twitch", ["twitch.tv"], "streaming", { color: "#9146ff" }),
  v("audible", "Audible", ["audible.com", "audible.in", "audible.co.uk"], "education", { manageUrl: "https://www.audible.com/account/overview", color: "#f8991c" }),
  v("kindle-unlimited", "Kindle Unlimited", ["kindle.com"], "education"),
  v("tidal", "Tidal", ["tidal.com"], "music"),
  v("deezer", "Deezer", ["deezer.com"], "music"),
  v("siriusxm", "SiriusXM", ["siriusxm.com"], "music", { color: "#0000eb" }),
  v("pandora", "Pandora", ["pandora.com"], "music"),
  v("xbox", "Xbox Game Pass", ["xbox.com"], "gaming", { manageUrl: "https://account.microsoft.com/services", color: "#107c10" }),
  v("playstation", "PlayStation", ["playstation.com", "sony.com", "txn-email.playstation.com"], "gaming", { manageUrl: "https://www.playstation.com/acct/management", color: "#003791" }),
  v("nintendo", "Nintendo", ["nintendo.com", "nintendo.net", "accounts.nintendo.com"], "gaming", { color: "#e60012" }),
  v("steam", "Steam", ["steampowered.com"], "gaming", { color: "#171a21" }),
  v("epic-games", "Epic Games", ["epicgames.com"], "gaming"),
  v("ea", "EA Play", ["ea.com"], "gaming"),

  // ── News & reading ──────────────────────────────────────────────────────────
  v("nytimes", "The New York Times", ["nytimes.com", "nyt.com"], "news", { manageUrl: "https://myaccount.nytimes.com/seg/subscription", color: "#000000", aliases: ["new york times", "nyt"] }),
  v("wsj", "The Wall Street Journal", ["wsj.com", "dowjones.com"], "news", { manageUrl: "https://customercenter.wsj.com", color: "#0274b6" }),
  v("washington-post", "The Washington Post", ["washingtonpost.com"], "news"),
  v("the-economist", "The Economist", ["economist.com"], "news", { color: "#e3120b" }),
  v("the-atlantic", "The Atlantic", ["theatlantic.com"], "news"),
  v("bloomberg", "Bloomberg", ["bloomberg.com", "bloomberg.net"], "news"),
  v("ft", "Financial Times", ["ft.com"], "news", { color: "#fcd0b1" }),
  v("medium", "Medium", ["medium.com"], "newsletter", { manageUrl: "https://medium.com/me/settings/membership" }),
  v("substack", "Substack", ["substack.com", "substackcdn.com"], "newsletter", { color: "#ff6719" }),
  v("beehiiv", "beehiiv", ["beehiiv.com", "mail.beehiiv.com"], "newsletter"),
  v("patreon", "Patreon", ["patreon.com"], "software", { manageUrl: "https://www.patreon.com/settings/memberships", color: "#ff424d" }),
  v("duolingo", "Duolingo", ["duolingo.com"], "education", { color: "#58cc02" }),
  v("coursera", "Coursera", ["coursera.org"], "education", { color: "#0056d2" }),
  v("udemy", "Udemy", ["udemy.com"], "education"),
  v("masterclass", "MasterClass", ["masterclass.com"], "education"),
  v("brilliant", "Brilliant", ["brilliant.org"], "education"),
  v("blinkist", "Blinkist", ["blinkist.com"], "education"),

  // ── Software, AI & productivity ─────────────────────────────────────────────
  v("openai", "OpenAI", ["openai.com", "chatgpt.com", "tm.openai.com"], "ai", {
    manageUrl: "https://chatgpt.com/#settings/Subscription",
    color: "#10a37f",
    aliases: ["chatgpt", "openai"],
    products: [
      { key: "chatgpt", name: "ChatGPT", pattern: /\bchatgpt\b/i, manageUrl: "https://chatgpt.com/#settings/Subscription" },
      { key: "api", name: "OpenAI API", pattern: /\b(api|platform\.openai|usage|credits?)\b/i, manageUrl: "https://platform.openai.com/settings/organization/billing" },
    ],
  }),
  v("anthropic", "Anthropic", ["anthropic.com", "claude.ai", "mail.anthropic.com"], "ai", {
    manageUrl: "https://claude.ai/settings/billing",
    color: "#d97757",
    aliases: ["claude", "anthropic"],
    products: [
      { key: "claude", name: "Claude", pattern: /\bclaude (pro|max|team|plan|subscription)\b/i, manageUrl: "https://claude.ai/settings/billing" },
      { key: "api", name: "Claude API", pattern: /\b(api|console|credits?|usage)\b/i, manageUrl: "https://console.anthropic.com/settings/billing" },
    ],
  }),
  v("perplexity", "Perplexity", ["perplexity.ai"], "ai", { manageUrl: "https://www.perplexity.ai/settings/account" }),
  v("midjourney", "Midjourney", ["midjourney.com"], "ai", { manageUrl: "https://www.midjourney.com/account" }),
  v("cursor", "Cursor", ["cursor.com", "cursor.sh", "anysphere.inc"], "dev", { manageUrl: "https://www.cursor.com/settings" }),
  v("github", "GitHub", ["github.com"], "dev", {
    manageUrl: "https://github.com/settings/billing",
    color: "#24292f",
    products: [{ key: "copilot", name: "GitHub Copilot", pattern: /\bcopilot\b/i, manageUrl: "https://github.com/settings/copilot" }],
  }),
  v("gitlab", "GitLab", ["gitlab.com"], "dev", { color: "#fc6d26" }),
  v("vercel", "Vercel", ["vercel.com"], "dev", { manageUrl: "https://vercel.com/account/billing", color: "#000000" }),
  v("netlify", "Netlify", ["netlify.com"], "dev"),
  v("cloudflare", "Cloudflare", ["cloudflare.com", "notify.cloudflare.com"], "dev", { manageUrl: "https://dash.cloudflare.com/?to=/:account/billing", color: "#f38020" }),
  v("railway", "Railway", ["railway.app", "railway.com"], "dev", { manageUrl: "https://railway.com/account/billing" }),
  v("render", "Render", ["render.com"], "dev"),
  v("fly", "Fly.io", ["fly.io"], "dev"),
  v("heroku", "Heroku", ["heroku.com"], "dev"),
  v("digitalocean", "DigitalOcean", ["digitalocean.com"], "cloud", { color: "#0080ff" }),
  v("aws", "Amazon Web Services", ["aws.amazon.com", "amazonaws.com", "aws.com"], "cloud", { manageUrl: "https://console.aws.amazon.com/billing/", color: "#ff9900", aliases: ["aws", "amazon web services"] }),
  v("google-cloud", "Google Cloud", ["cloud.google.com"], "cloud", { manageUrl: "https://console.cloud.google.com/billing" }),
  v("azure", "Microsoft Azure", ["azure.com", "microsoftazure.com"], "cloud"),
  v("supabase", "Supabase", ["supabase.com", "supabase.io"], "dev", { color: "#3ecf8e" }),
  v("mongodb", "MongoDB Atlas", ["mongodb.com"], "dev"),
  v("sentry", "Sentry", ["sentry.io"], "dev"),
  v("datadog", "Datadog", ["datadoghq.com"], "dev"),
  v("twilio", "Twilio", ["twilio.com"], "dev"),
  v("jetbrains", "JetBrains", ["jetbrains.com"], "dev", { manageUrl: "https://account.jetbrains.com/licenses" }),
  v("replit", "Replit", ["replit.com"], "dev"),
  v("figma", "Figma", ["figma.com"], "software", { manageUrl: "https://www.figma.com/settings", color: "#a259ff" }),
  v("notion", "Notion", ["notion.so", "makenotion.com", "mail.notion.so"], "productivity", { manageUrl: "https://www.notion.so/", color: "#000000" }),
  v("linear", "Linear", ["linear.app"], "productivity", { color: "#5e6ad2" }),
  v("slack", "Slack", ["slack.com", "slackhq.com"], "productivity", { color: "#4a154b" }),
  v("zoom", "Zoom", ["zoom.us", "zoom.com"], "productivity", { manageUrl: "https://zoom.us/billing", color: "#2d8cff" }),
  v("atlassian", "Atlassian", ["atlassian.com", "atlassian.net"], "productivity"),
  v("asana", "Asana", ["asana.com"], "productivity"),
  v("todoist", "Todoist", ["todoist.com", "doist.com"], "productivity"),
  v("evernote", "Evernote", ["evernote.com"], "productivity"),
  v("obsidian", "Obsidian", ["obsidian.md"], "productivity"),
  v("raycast", "Raycast", ["raycast.com"], "productivity"),
  v("setapp", "Setapp", ["setapp.com", "macpaw.com"], "software"),
  v("adobe", "Adobe", ["adobe.com", "mail.adobe.com", "email.adobe.com"], "software", { manageUrl: "https://account.adobe.com/plans", color: "#fa0f00", aliases: ["creative cloud", "adobe"] }),
  v("canva", "Canva", ["canva.com"], "software", { manageUrl: "https://www.canva.com/settings/billing-and-teams", color: "#00c4cc" }),
  v("grammarly", "Grammarly", ["grammarly.com"], "software", { manageUrl: "https://account.grammarly.com/subscription", color: "#15c39a" }),
  v("dropbox", "Dropbox", ["dropbox.com", "dropboxmail.com"], "storage", { manageUrl: "https://www.dropbox.com/account/plan", color: "#0061ff" }),
  v("box", "Box", ["box.com"], "storage"),
  v("1password", "1Password", ["1password.com", "agilebits.com"], "software", { manageUrl: "https://my.1password.com/billing", color: "#0572ec" }),
  v("lastpass", "LastPass", ["lastpass.com"], "software"),
  v("bitwarden", "Bitwarden", ["bitwarden.com"], "software"),
  v("nordvpn", "NordVPN", ["nordvpn.com", "nordaccount.com", "nordsecurity.com"], "vpn", { manageUrl: "https://my.nordaccount.com/dashboard/" }),
  v("expressvpn", "ExpressVPN", ["expressvpn.com"], "vpn"),
  v("proton", "Proton", ["proton.me", "protonmail.com"], "software", { manageUrl: "https://account.proton.me/dashboard" }),
  v("calendly", "Calendly", ["calendly.com"], "productivity"),
  v("docusign", "DocuSign", ["docusign.net", "docusign.com"], "productivity", { category: "updates" }),
  v("mailchimp", "Mailchimp", ["mailchimp.com"], "software"),
  v("squarespace", "Squarespace", ["squarespace.com"], "domain", { manageUrl: "https://account.squarespace.com/" }),
  v("wix", "Wix", ["wix.com"], "domain"),
  v("webflow", "Webflow", ["webflow.com"], "software"),
  v("shopify", "Shopify", ["shopify.com"], "software"),
  v("namecheap", "Namecheap", ["namecheap.com"], "domain", { manageUrl: "https://ap.www.namecheap.com/domains/list/", color: "#de3723" }),
  v("godaddy", "GoDaddy", ["godaddy.com"], "domain", { manageUrl: "https://account.godaddy.com/products" }),
  v("porkbun", "Porkbun", ["porkbun.com"], "domain"),
  v("google-domains", "Squarespace Domains", ["domains.squarespace.com"], "domain"),
  v("linkedin", "LinkedIn", ["linkedin.com", "e.linkedin.com", "linkedinmail.com"], "social", {
    category: "career",
    color: "#0a66c2",
    manageUrl: "https://www.linkedin.com/premium/manage/",
    products: [{ key: "premium", name: "LinkedIn Premium", pattern: /\b(linkedin )?premium\b/i, kind: "software" }],
  }),

  // ── Big tech (multi-product) ────────────────────────────────────────────────
  v("apple", "Apple", ["apple.com", "email.apple.com", "itunes.com", "id.apple.com", "insideapple.apple.com"], "software", {
    manageUrl: "https://apps.apple.com/account/subscriptions",
    color: "#555555",
    processor: true,
    products: [
      { key: "icloud", name: "iCloud+", pattern: /\bicloud\+?( storage)?\b/i, kind: "storage" },
      { key: "apple-music", name: "Apple Music", pattern: /\bapple music\b/i, kind: "music" },
      { key: "apple-tv", name: "Apple TV+", pattern: /\bapple tv\+?\b/i, kind: "streaming" },
      { key: "apple-one", name: "Apple One", pattern: /\bapple one\b/i },
      { key: "apple-arcade", name: "Apple Arcade", pattern: /\bapple arcade\b/i, kind: "gaming" },
      { key: "apple-news", name: "Apple News+", pattern: /\bapple news\+?\b/i, kind: "news" },
      { key: "apple-fitness", name: "Apple Fitness+", pattern: /\bfitness\+/i, kind: "fitness" },
      { key: "applecare", name: "AppleCare+", pattern: /\bapplecare\+?\b/i },
    ],
  }),
  v("google", "Google", ["google.com", "accounts.google.com", "youtube.com", "googlemail.com"], "software", {
    color: "#4285f4",
    processor: true,
    products: [
      { key: "google-one", name: "Google One", pattern: /\bgoogle one\b/i, kind: "storage", manageUrl: "https://one.google.com/settings" },
      { key: "youtube-premium", name: "YouTube Premium", pattern: /\byoutube premium\b/i, kind: "streaming", manageUrl: "https://www.youtube.com/paid_memberships" },
      { key: "youtube-music", name: "YouTube Music", pattern: /\byoutube music\b/i, kind: "music", manageUrl: "https://www.youtube.com/paid_memberships" },
      { key: "google-workspace", name: "Google Workspace", pattern: /\b(google )?workspace\b/i, manageUrl: "https://admin.google.com/ac/billing/subscriptions" },
      { key: "gemini", name: "Google AI Pro", pattern: /\b(gemini|ai (pro|premium|ultra))\b/i, kind: "ai", manageUrl: "https://one.google.com/settings" },
      { key: "google-fi", name: "Google Fi", pattern: /\bgoogle fi\b/i, kind: "telecom" },
      { key: "nest-aware", name: "Nest Aware", pattern: /\bnest aware\b/i },
      { key: "play-pass", name: "Google Play Pass", pattern: /\bplay pass\b/i, kind: "gaming" },
    ],
  }),
  v("microsoft", "Microsoft", ["microsoft.com", "accountprotection.microsoft.com", "email.microsoft.com", "outlook.com"], "software", {
    manageUrl: "https://account.microsoft.com/services",
    color: "#00a4ef",
    products: [
      { key: "microsoft-365", name: "Microsoft 365", pattern: /\b(microsoft|office) 365\b/i },
      { key: "xbox", name: "Xbox Game Pass", pattern: /\b(xbox|game pass)\b/i, kind: "gaming" },
      { key: "copilot-pro", name: "Copilot Pro", pattern: /\bcopilot pro\b/i, kind: "ai" },
    ],
  }),
  v("amazon", "Amazon", ["amazon.com", "amazon.in", "amazon.co.uk", "amazon.ca", "amazon.de", "marketplace.amazon.com", "primevideo.com"], "shopping", {
    color: "#ff9900",
    products: [
      { key: "prime", name: "Amazon Prime", pattern: /\b(amazon )?prime (membership|video|renew|monthly|annual|member)|\bprime membership\b/i, kind: "streaming", manageUrl: "https://www.amazon.com/mc/manage" },
      { key: "kindle-unlimited", name: "Kindle Unlimited", pattern: /\bkindle unlimited\b/i, kind: "education", manageUrl: "https://www.amazon.com/kindle-dbs/ku/ku-central" },
      { key: "music-unlimited", name: "Amazon Music Unlimited", pattern: /\bmusic unlimited\b/i, kind: "music" },
    ],
  }),

  // ── Payments & processors ───────────────────────────────────────────────────
  v("stripe", "Stripe", ["stripe.com"], "processor", { processor: true, color: "#635bff" }),
  v("paddle", "Paddle", ["paddle.com", "paddle.net"], "processor", { processor: true }),
  v("lemon-squeezy", "Lemon Squeezy", ["lemonsqueezy.com"], "processor", { processor: true }),
  v("gumroad", "Gumroad", ["gumroad.com"], "processor", { processor: true }),
  v("fastspring", "FastSpring", ["fastspring.com"], "processor", { processor: true }),
  v("chargebee", "Chargebee", ["chargebee.com"], "processor", { processor: true }),
  v("recurly", "Recurly", ["recurly.com"], "processor", { processor: true }),
  v("paypal", "PayPal", ["paypal.com", "paypal.co.uk", "e.paypal.com"], "payments", { processor: true, color: "#003087", manageUrl: "https://www.paypal.com/myaccount/autopay/" }),
  v("venmo", "Venmo", ["venmo.com"], "payments", { color: "#3d95ce" }),
  v("cash-app", "Cash App", ["cash.app", "square.com", "squareup.com"], "payments", { color: "#00d632" }),
  v("zelle", "Zelle", ["zellepay.com"], "payments"),
  v("wise", "Wise", ["wise.com", "transferwise.com"], "payments"),
  v("revolut", "Revolut", ["revolut.com"], "bank"),
  v("klarna", "Klarna", ["klarna.com"], "loan"),
  v("affirm", "Affirm", ["affirm.com"], "loan"),
  v("afterpay", "Afterpay", ["afterpay.com"], "loan"),
  v("razorpay", "Razorpay", ["razorpay.com"], "processor", { processor: true }),
  v("paytm", "Paytm", ["paytm.com"], "payments"),
  v("phonepe", "PhonePe", ["phonepe.com"], "payments"),

  // ── Banks, cards & investing ────────────────────────────────────────────────
  v("chase", "Chase", ["chase.com", "jpmorgan.com", "jpmchase.com"], "bank", { color: "#117aca", manageUrl: "https://www.chase.com/" }),
  v("bank-of-america", "Bank of America", ["bankofamerica.com", "bofa.com", "ealerts.bankofamerica.com"], "bank", { color: "#e31837" }),
  v("wells-fargo", "Wells Fargo", ["wellsfargo.com", "notify.wellsfargo.com"], "bank", { color: "#d71e28" }),
  v("citi", "Citi", ["citi.com", "citibank.com", "citicards.com", "info6.citi.com"], "bank", { color: "#056dae" }),
  v("capital-one", "Capital One", ["capitalone.com", "notification.capitalone.com"], "bank", { color: "#004977" }),
  v("amex", "American Express", ["americanexpress.com", "aexp.com", "welcome.aexp.com", "email.americanexpress.com"], "card", { color: "#006fcf", aliases: ["amex", "american express"] }),
  v("discover", "Discover", ["discover.com", "service.discover.com"], "card", { color: "#ff6000" }),
  v("us-bank", "U.S. Bank", ["usbank.com"], "bank"),
  v("pnc", "PNC", ["pnc.com"], "bank"),
  v("td-bank", "TD Bank", ["td.com", "tdbank.com"], "bank"),
  v("ally", "Ally", ["ally.com"], "bank"),
  v("sofi", "SoFi", ["sofi.com", "sofi.org"], "bank"),
  v("marcus", "Marcus by Goldman Sachs", ["marcus.com", "gs.com"], "bank"),
  v("apple-card", "Apple Card", ["applecard.apple"], "card"),
  v("synchrony", "Synchrony", ["synchrony.com", "syf.com"], "card"),
  v("barclays", "Barclays", ["barclays.com", "barclaysus.com", "barclaycardus.com"], "card"),
  v("navy-federal", "Navy Federal", ["navyfederal.org"], "bank"),
  v("usaa", "USAA", ["usaa.com"], "bank"),
  v("chime", "Chime", ["chime.com"], "bank"),
  v("mercury", "Mercury", ["mercury.com"], "bank"),
  v("hdfc", "HDFC Bank", ["hdfcbank.com", "hdfcbank.net"], "bank"),
  v("icici", "ICICI Bank", ["icicibank.com"], "bank"),
  v("sbi", "State Bank of India", ["sbi.co.in", "onlinesbi.sbi"], "bank"),
  v("axis", "Axis Bank", ["axisbank.com"], "bank"),
  v("kotak", "Kotak Mahindra Bank", ["kotak.com"], "bank"),
  v("schwab", "Charles Schwab", ["schwab.com"], "investing", { color: "#00a0df" }),
  v("fidelity", "Fidelity", ["fidelity.com", "fmr.com"], "investing", { color: "#368727" }),
  v("vanguard", "Vanguard", ["vanguard.com"], "investing", { color: "#96151d" }),
  v("robinhood", "Robinhood", ["robinhood.com"], "investing", { color: "#00c805" }),
  v("etrade", "E*TRADE", ["etrade.com"], "investing"),
  v("wealthfront", "Wealthfront", ["wealthfront.com"], "investing"),
  v("betterment", "Betterment", ["betterment.com"], "investing"),
  v("acorns", "Acorns", ["acorns.com"], "investing"),
  v("webull", "Webull", ["webull.com"], "investing"),
  v("zerodha", "Zerodha", ["zerodha.com", "zerodha.net"], "investing"),
  v("coinbase", "Coinbase", ["coinbase.com"], "crypto", { color: "#0052ff" }),
  v("kraken", "Kraken", ["kraken.com"], "crypto"),
  v("binance", "Binance", ["binance.com", "binance.us"], "crypto"),
  v("adp", "ADP", ["adp.com"], "payroll"),
  v("gusto", "Gusto", ["gusto.com"], "payroll"),
  v("paychex", "Paychex", ["paychex.com"], "payroll"),
  v("rippling", "Rippling", ["rippling.com"], "payroll"),
  v("justworks", "Justworks", ["justworks.com"], "payroll"),
  v("deel", "Deel", ["deel.com"], "payroll"),
  v("irs", "IRS", ["irs.gov"], "tax"),
  v("turbotax", "TurboTax", ["intuit.com", "turbotax.com", "turbotax.intuit.com"], "tax"),
  v("hr-block", "H&R Block", ["hrblock.com"], "tax"),
  v("credit-karma", "Credit Karma", ["creditkarma.com"], "credit"),
  v("experian", "Experian", ["experian.com"], "credit"),
  v("equifax", "Equifax", ["equifax.com"], "credit"),
  v("transunion", "TransUnion", ["transunion.com"], "credit"),
  v("rocket-money", "Rocket Money", ["rocketmoney.com", "truebill.com"], "software"),
  v("ynab", "YNAB", ["ynab.com", "youneedabudget.com"], "software"),

  // ── Utilities, telecom & insurance ──────────────────────────────────────────
  v("verizon", "Verizon", ["verizon.com", "verizonwireless.com", "vzw.com", "ecrmemail.verizonwireless.com"], "telecom", { color: "#cd040b" }),
  v("att", "AT&T", ["att.com", "att.net", "emaildl.att-mail.com"], "telecom", { color: "#00a8e0", aliases: ["at&t"] }),
  v("t-mobile", "T-Mobile", ["t-mobile.com", "tmobile.com"], "telecom", { color: "#e20074" }),
  v("mint-mobile", "Mint Mobile", ["mintmobile.com"], "telecom"),
  v("visible", "Visible", ["visible.com"], "telecom"),
  v("xfinity", "Xfinity", ["xfinity.com", "comcast.net", "comcast.com"], "internet", { color: "#6138f5", aliases: ["comcast", "xfinity"] }),
  v("spectrum", "Spectrum", ["spectrum.com", "spectrum.net", "charter.com"], "internet"),
  v("cox", "Cox", ["cox.com", "cox.net"], "internet"),
  v("optimum", "Optimum", ["optimum.net", "optimum.com"], "internet"),
  v("frontier", "Frontier", ["frontier.com", "frontiernet.net"], "internet"),
  v("google-fiber", "Google Fiber", ["fiber.google.com"], "internet"),
  v("starlink", "Starlink", ["starlink.com"], "internet"),
  v("con-edison", "Con Edison", ["coned.com"], "utility"),
  v("pge", "PG&E", ["pge.com"], "utility"),
  v("duke-energy", "Duke Energy", ["duke-energy.com"], "utility"),
  v("national-grid", "National Grid", ["nationalgridus.com", "nationalgrid.com"], "utility"),
  v("sce", "Southern California Edison", ["sce.com"], "utility"),
  v("dominion", "Dominion Energy", ["dominionenergy.com"], "utility"),
  v("eversource", "Eversource", ["eversource.com"], "utility"),
  v("pseg", "PSEG", ["pseg.com"], "utility"),
  v("xcel", "Xcel Energy", ["xcelenergy.com"], "utility"),
  v("geico", "GEICO", ["geico.com"], "insurance", { color: "#154b8c" }),
  v("progressive", "Progressive", ["progressive.com"], "insurance"),
  v("state-farm", "State Farm", ["statefarm.com"], "insurance"),
  v("allstate", "Allstate", ["allstate.com"], "insurance"),
  v("lemonade", "Lemonade", ["lemonade.com"], "insurance"),
  v("liberty-mutual", "Liberty Mutual", ["libertymutual.com"], "insurance"),
  v("bilt", "Bilt Rewards", ["biltrewards.com", "bilt.com"], "rent"),
  v("appfolio", "AppFolio", ["appfolio.com"], "rent"),
  v("rentcafe", "RentCafe", ["rentcafe.com", "yardi.com"], "rent"),
  v("navient", "Navient", ["navient.com"], "loan"),
  v("nelnet", "Nelnet", ["nelnet.com", "nelnet.net"], "loan"),
  v("mohela", "MOHELA", ["mohela.com"], "loan"),
  v("aidvantage", "Aidvantage", ["aidvantage.com"], "loan"),
  v("sallie-mae", "Sallie Mae", ["salliemae.com"], "loan"),

  // ── Shopping, food & delivery ───────────────────────────────────────────────
  v("walmart", "Walmart", ["walmart.com"], "shopping", { color: "#0071ce", products: [{ key: "walmart-plus", name: "Walmart+", pattern: /\bwalmart\+/i, kind: "shopping" }] }),
  v("target", "Target", ["target.com"], "shopping", { color: "#cc0000" }),
  v("costco", "Costco", ["costco.com"], "shopping", { products: [{ key: "membership", name: "Costco Membership", pattern: /\bmembership\b/i }] }),
  v("best-buy", "Best Buy", ["bestbuy.com"], "shopping"),
  v("ebay", "eBay", ["ebay.com"], "marketplace"),
  v("etsy", "Etsy", ["etsy.com"], "marketplace"),
  v("temu", "Temu", ["temu.com"], "marketplace"),
  v("shein", "SHEIN", ["shein.com", "sheinemail.com"], "shopping"),
  v("aliexpress", "AliExpress", ["aliexpress.com"], "marketplace"),
  v("nike", "Nike", ["nike.com"], "shopping"),
  v("ikea", "IKEA", ["ikea.com", "ikea.us"], "shopping"),
  v("home-depot", "The Home Depot", ["homedepot.com"], "shopping"),
  v("lowes", "Lowe's", ["lowes.com"], "shopping"),
  v("wayfair", "Wayfair", ["wayfair.com"], "shopping"),
  v("chewy", "Chewy", ["chewy.com"], "shopping"),
  v("sephora", "Sephora", ["sephora.com"], "shopping"),
  v("uniqlo", "UNIQLO", ["uniqlo.com", "uniqlo.us"], "shopping"),
  v("zara", "Zara", ["zara.com"], "shopping"),
  v("nordstrom", "Nordstrom", ["nordstrom.com"], "shopping"),
  v("macys", "Macy's", ["macys.com"], "shopping"),
  v("flipkart", "Flipkart", ["flipkart.com"], "shopping"),
  v("whole-foods", "Whole Foods Market", ["wholefoodsmarket.com"], "grocery", { aliases: ["whole foods", "whole foods mkt", "wholefds"] }),
  v("trader-joes", "Trader Joe's", ["traderjoes.com"], "grocery", { aliases: ["trader joe's", "trader joes"] }),
  v("safeway", "Safeway", ["safeway.com"], "grocery"),
  v("kroger", "Kroger", ["kroger.com"], "grocery"),
  v("wegmans", "Wegmans", ["wegmans.com"], "grocery"),
  v("instacart", "Instacart", ["instacart.com"], "grocery", { products: [{ key: "instacart-plus", name: "Instacart+", pattern: /\binstacart\+/i }] }),
  v("doordash", "DoorDash", ["doordash.com"], "food", { color: "#ff3008", products: [{ key: "dashpass", name: "DashPass", pattern: /\bdashpass\b/i }] }),
  v("uber-eats", "Uber Eats", ["ubereats.com"], "food"),
  v("grubhub", "Grubhub", ["grubhub.com"], "food"),
  v("swiggy", "Swiggy", ["swiggy.in", "swiggy.com"], "food"),
  v("zomato", "Zomato", ["zomato.com"], "food"),
  v("hellofresh", "HelloFresh", ["hellofresh.com"], "food", { category: "subscriptions" }),
  v("starbucks", "Starbucks", ["starbucks.com"], "food"),
  v("ups", "UPS", ["ups.com"], "carrier", { color: "#351c15" }),
  v("usps", "USPS", ["usps.com", "usps.gov", "email.informeddelivery.usps.com"], "carrier", { color: "#333366" }),
  v("fedex", "FedEx", ["fedex.com"], "carrier", { color: "#4d148c" }),
  v("dhl", "DHL", ["dhl.com", "dhl.de"], "carrier", { color: "#ffcc00" }),
  v("ontrac", "OnTrac", ["ontrac.com"], "carrier"),
  v("narvar", "Narvar", ["narvar.com"], "carrier"),
  v("aftership", "AfterShip", ["aftership.com"], "carrier"),
  v("route", "Route", ["route.com"], "carrier"),

  // ── Travel ──────────────────────────────────────────────────────────────────
  v("united", "United Airlines", ["united.com", "news.united.com"], "airline", { color: "#002244" }),
  v("delta", "Delta", ["delta.com", "e.delta.com"], "airline", { color: "#c01933" }),
  v("american-airlines", "American Airlines", ["aa.com", "info.email.aa.com"], "airline", { color: "#0078d2" }),
  v("southwest", "Southwest", ["southwest.com", "luv.southwest.com"], "airline", { color: "#304cb2" }),
  v("jetblue", "JetBlue", ["jetblue.com"], "airline"),
  v("alaska", "Alaska Airlines", ["alaskaair.com"], "airline"),
  v("spirit", "Spirit", ["spirit.com", "fly.spirit-airlines.com"], "airline"),
  v("frontier-airlines", "Frontier Airlines", ["flyfrontier.com"], "airline"),
  v("air-canada", "Air Canada", ["aircanada.com", "aircanada.ca"], "airline"),
  v("air-india", "Air India", ["airindia.com", "airindia.in"], "airline"),
  v("indigo", "IndiGo", ["goindigo.in"], "airline"),
  v("emirates", "Emirates", ["emirates.com"], "airline"),
  v("qatar", "Qatar Airways", ["qatarairways.com"], "airline"),
  v("lufthansa", "Lufthansa", ["lufthansa.com"], "airline"),
  v("british-airways", "British Airways", ["ba.com", "britishairways.com"], "airline"),
  v("singapore-airlines", "Singapore Airlines", ["singaporeair.com"], "airline"),
  v("marriott", "Marriott", ["marriott.com", "email-marriott.com"], "hotel", { color: "#a71930" }),
  v("hilton", "Hilton", ["hilton.com", "h1.hilton.com"], "hotel", { color: "#104c97" }),
  v("hyatt", "Hyatt", ["hyatt.com"], "hotel"),
  v("ihg", "IHG", ["ihg.com"], "hotel"),
  v("airbnb", "Airbnb", ["airbnb.com"], "hotel", { color: "#ff5a5f" }),
  v("vrbo", "Vrbo", ["vrbo.com"], "hotel"),
  v("booking", "Booking.com", ["booking.com"], "travel", { color: "#003580" }),
  v("expedia", "Expedia", ["expedia.com", "expediamail.com"], "travel"),
  v("hotels-com", "Hotels.com", ["hotels.com"], "travel"),
  v("kayak", "KAYAK", ["kayak.com"], "travel"),
  v("priceline", "Priceline", ["priceline.com"], "travel"),
  v("agoda", "Agoda", ["agoda.com"], "travel"),
  v("makemytrip", "MakeMyTrip", ["makemytrip.com"], "travel"),
  v("tripit", "TripIt", ["tripit.com"], "travel"),
  v("uber", "Uber", ["uber.com"], "transport", { color: "#000000", products: [{ key: "uber-one", name: "Uber One", pattern: /\buber one\b/i }] }),
  v("lyft", "Lyft", ["lyft.com", "lyftmail.com"], "transport", { color: "#ff00bf" }),
  v("amtrak", "Amtrak", ["amtrak.com"], "transport"),
  v("hertz", "Hertz", ["hertz.com"], "car_rental"),
  v("enterprise", "Enterprise", ["enterprise.com"], "car_rental"),
  v("avis", "Avis", ["avis.com"], "car_rental"),
  v("turo", "Turo", ["turo.com"], "car_rental"),
  v("clear", "CLEAR", ["clearme.com"], "travel", { category: "subscriptions" }),

  // ── Careers ─────────────────────────────────────────────────────────────────
  v("indeed", "Indeed", ["indeed.com", "indeedemail.com"], "jobs", { color: "#2164f3" }),
  v("glassdoor", "Glassdoor", ["glassdoor.com"], "jobs"),
  v("ziprecruiter", "ZipRecruiter", ["ziprecruiter.com"], "jobs"),
  v("wellfound", "Wellfound", ["wellfound.com", "angel.co", "angellist.com"], "jobs"),
  v("dice", "Dice", ["dice.com"], "jobs"),
  v("hired", "Hired", ["hired.com"], "jobs"),
  v("otta", "Welcome to the Jungle", ["otta.com", "welcometothejungle.com"], "jobs"),
  v("handshake", "Handshake", ["joinhandshake.com"], "jobs"),
  v("ycombinator", "Work at a Startup", ["workatastartup.com", "ycombinator.com"], "jobs"),
  v("greenhouse", "Greenhouse", ["greenhouse.io", "us.greenhouse-mail.io", "greenhouse-mail.io"], "ats"),
  v("lever", "Lever", ["lever.co", "hire.lever.co", "jobs.lever.co"], "ats"),
  v("ashby", "Ashby", ["ashbyhq.com"], "ats"),
  v("workday", "Workday", ["myworkday.com", "workday.com", "myworkdayjobs.com"], "ats"),
  v("smartrecruiters", "SmartRecruiters", ["smartrecruiters.com"], "ats"),
  v("icims", "iCIMS", ["icims.com"], "ats"),
  v("jobvite", "Jobvite", ["jobvite.com"], "ats"),
  v("bamboohr", "BambooHR", ["bamboohr.com"], "ats"),
  v("taleo", "Taleo", ["taleo.net"], "ats"),
  v("successfactors", "SuccessFactors", ["successfactors.com", "sapsf.com"], "ats"),
  v("gem", "Gem", ["gem.com"], "ats"),
  v("goodtime", "GoodTime", ["goodtime.io"], "ats"),
  v("hackerrank", "HackerRank", ["hackerrank.com", "hackerrankforwork.com"], "assessment"),
  v("codesignal", "CodeSignal", ["codesignal.com"], "assessment"),
  v("codility", "Codility", ["codility.com"], "assessment"),
  v("hirevue", "HireVue", ["hirevue.com"], "assessment"),
  v("karat", "Karat", ["karat.com", "karat.io"], "assessment"),

  // ── Social ──────────────────────────────────────────────────────────────────
  v("facebook", "Facebook", ["facebook.com", "facebookmail.com", "meta.com"], "social", { color: "#1877f2" }),
  v("instagram", "Instagram", ["instagram.com", "mail.instagram.com"], "social", { color: "#e1306c" }),
  v("x", "X", ["x.com", "twitter.com"], "social", { color: "#000000", aliases: ["twitter"] }),
  v("reddit", "Reddit", ["reddit.com", "redditmail.com"], "social", { color: "#ff4500" }),
  v("discord", "Discord", ["discord.com", "discordapp.com"], "social", { color: "#5865f2", products: [{ key: "nitro", name: "Discord Nitro", pattern: /\bnitro\b/i, kind: "software" }] }),
  v("pinterest", "Pinterest", ["pinterest.com"], "social"),
  v("tiktok", "TikTok", ["tiktok.com"], "social"),
  v("snapchat", "Snapchat", ["snapchat.com"], "social"),
  v("nextdoor", "Nextdoor", ["nextdoor.com"], "social"),
  v("quora", "Quora", ["quora.com"], "social"),
  v("whatsapp", "WhatsApp", ["whatsapp.com"], "social"),
  v("telegram", "Telegram", ["telegram.org"], "social"),

  // ── Identity & security ─────────────────────────────────────────────────────
  v("okta", "Okta", ["okta.com"], "identity"),
  v("auth0", "Auth0", ["auth0.com"], "identity"),
  v("haveibeenpwned", "Have I Been Pwned", ["haveibeenpwned.com"], "identity"),
  v("aura", "Aura", ["aura.com"], "identity", { category: "subscriptions" }),
  v("norton", "Norton", ["norton.com", "nortonlifelock.com", "gen.digital"], "software"),

  // ── Health ──────────────────────────────────────────────────────────────────
  v("zocdoc", "Zocdoc", ["zocdoc.com"], "health"),
  v("one-medical", "One Medical", ["onemedical.com"], "health"),
  v("cvs", "CVS", ["cvs.com", "cvshealth.com"], "health"),
  v("walgreens", "Walgreens", ["walgreens.com"], "health"),
  v("kaiser", "Kaiser Permanente", ["kp.org"], "health"),
  v("mychart", "MyChart", ["mychart.com", "epic.com"], "health"),
  v("quest", "Quest Diagnostics", ["questdiagnostics.com"], "health"),
  v("labcorp", "Labcorp", ["labcorp.com"], "health"),
  v("teladoc", "Teladoc", ["teladoc.com"], "health"),
  v("aetna", "Aetna", ["aetna.com"], "health"),
  v("cigna", "Cigna", ["cigna.com"], "health"),
  v("uhc", "UnitedHealthcare", ["uhc.com", "myuhc.com"], "health"),
  v("bcbs", "Blue Cross Blue Shield", ["bcbs.com", "anthem.com", "bluecrossma.org"], "health"),
  v("oscar", "Oscar Health", ["hioscar.com"], "health"),
  v("delta-dental", "Delta Dental", ["deltadental.com", "deltadentalins.com"], "health"),
  v("peloton", "Peloton", ["onepeloton.com", "peloton.com"], "fitness"),
  v("strava", "Strava", ["strava.com"], "fitness", { manageUrl: "https://www.strava.com/account" }),
  v("headspace", "Headspace", ["headspace.com"], "fitness"),
  v("calm", "Calm", ["calm.com"], "fitness"),
  v("classpass", "ClassPass", ["classpass.com"], "fitness"),
  v("equinox", "Equinox", ["equinox.com"], "fitness"),
  v("planet-fitness", "Planet Fitness", ["planetfitness.com"], "fitness"),
  v("whoop", "WHOOP", ["whoop.com"], "fitness"),
  v("oura", "Oura", ["ouraring.com"], "fitness"),

  // ── Events & dining ─────────────────────────────────────────────────────────
  v("eventbrite", "Eventbrite", ["eventbrite.com"], "events"),
  v("ticketmaster", "Ticketmaster", ["ticketmaster.com", "livenation.com"], "events"),
  v("stubhub", "StubHub", ["stubhub.com"], "events"),
  v("seatgeek", "SeatGeek", ["seatgeek.com"], "events"),
  v("axs", "AXS", ["axs.com"], "events"),
  v("meetup", "Meetup", ["meetup.com"], "events"),
  v("luma", "Luma", ["lu.ma", "luma.com"], "events"),
  v("partiful", "Partiful", ["partiful.com"], "events"),
  v("evite", "Evite", ["evite.com"], "events"),
  v("paperless-post", "Paperless Post", ["paperlesspost.com"], "events"),
  v("opentable", "OpenTable", ["opentable.com"], "restaurant"),
  v("resy", "Resy", ["resy.com"], "restaurant"),
  v("tock", "Tock", ["exploretock.com"], "restaurant"),
];

/** Specific sender addresses whose purpose is more precise than the vendor's default. */
export const ADDRESS_PRIORS: { pattern: RegExp; category: Category; reason: string }[] = [
  { pattern: /@accounts\.google\.com$/i, category: "security", reason: "Google account security sender" },
  { pattern: /^(no-?reply|noreply)@id\.apple\.com$/i, category: "security", reason: "Apple ID security sender" },
  { pattern: /^appleid@id\.apple\.com$/i, category: "security", reason: "Apple ID security sender" },
  { pattern: /@accountprotection\.microsoft\.com$/i, category: "security", reason: "Microsoft account protection sender" },
  { pattern: /^account-update@amazon\./i, category: "security", reason: "Amazon account update sender" },
  { pattern: /^security@facebookmail\.com$/i, category: "security", reason: "Facebook security sender" },
  { pattern: /^(auto-confirm|shipment-tracking|order-update|delivery-notification|returns)@amazon\./i, category: "orders", reason: "Amazon order sender" },
  { pattern: /^(digital-no-reply|prime)@amazon\./i, category: "subscriptions", reason: "Amazon digital/Prime sender" },
  { pattern: /^payments-noreply@google\.com$/i, category: "subscriptions", reason: "Google payments sender" },
  { pattern: /^googleplay-noreply@google\.com$/i, category: "subscriptions", reason: "Google Play receipts sender" },
  { pattern: /^calendar-notification@google\.com$/i, category: "events", reason: "Google Calendar sender" },
  { pattern: /^(no_reply|do_not_reply)@email\.apple\.com$/i, category: "subscriptions", reason: "Apple receipts sender" },
  { pattern: /^(jobs-noreply|jobs-listings|jobalerts-noreply)@linkedin\.com$/i, category: "career", reason: "LinkedIn jobs sender" },
  { pattern: /^(messages-noreply|invitations|notifications-noreply|messaging-digest-noreply)@linkedin\.com$/i, category: "career", reason: "LinkedIn networking sender" },
  { pattern: /^(newsletters?|news|digest|daily|weekly)@/i, category: "newsletters", reason: "Newsletter sender address" },
  { pattern: /^(marketing|promo(tions)?|offers|deals|sales|hello|info)@/i, category: "promotions", reason: "Marketing sender address" },
  { pattern: /^(security|security-noreply|alerts?|account-security)@/i, category: "security", reason: "Security sender address" },
  { pattern: /^(billing|invoices?|receipts?|payments?)@/i, category: "subscriptions", reason: "Billing sender address" },
  { pattern: /^(careers|recruiting|talent|jobs|hiring|recruitment)@/i, category: "career", reason: "Recruiting sender address" },
];

export const CONSUMER_MAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "msn.com",
  "yahoo.com",
  "yahoo.co.in",
  "ymail.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
  "pm.me",
  "hey.com",
  "fastmail.com",
  "zoho.com",
  "gmx.com",
  "gmx.net",
  "mail.com",
  "rediffmail.com",
  "hushmail.com",
  "tutanota.com",
  "duck.com",
]);
