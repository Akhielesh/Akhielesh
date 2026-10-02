import {
  Bell,
  BellRing,
  Briefcase,
  CalendarClock,
  HeartPulse,
  House,
  Inbox,
  Mail,
  Package,
  Plane,
  Repeat,
  Settings,
  ShieldCheck,
  Sparkles,
  Wallet,
  WandSparkles,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  description: string;
  badge?: "alerts";
}

export const NAV: { section: string | null; items: NavItem[] }[] = [
  {
    section: null,
    items: [
      { to: "/", label: "Overview", icon: House, description: "Your command center" },
      { to: "/alerts", label: "Alerts", icon: Bell, description: "Everything that needs attention", badge: "alerts" },
      { to: "/timeline", label: "Timeline", icon: CalendarClock, description: "Renewals, bills, trips & interviews ahead" },
      { to: "/ask", label: "Ask Adminak", icon: Sparkles, description: "Questions about your life admin" },
    ],
  },
  {
    section: "Money",
    items: [
      { to: "/subscriptions", label: "Subscriptions", icon: Repeat, description: "Recurring charges, trials & price changes" },
      { to: "/money", label: "Bills & spending", icon: Wallet, description: "Bills due, transactions and analytics" },
    ],
  },
  {
    section: "Life",
    items: [
      { to: "/career", label: "Career", icon: Briefcase, description: "Applications, interviews & offers" },
      { to: "/orders", label: "Orders", icon: Package, description: "Shipments and deliveries" },
      { to: "/travel", label: "Travel", icon: Plane, description: "Flights, stays and trips" },
      { to: "/security", label: "Security", icon: ShieldCheck, description: "Sign-ins, breaches & account changes" },
      { to: "/life", label: "People & events", icon: HeartPulse, description: "Invites, appointments and people" },
    ],
  },
  {
    section: "Inbox",
    items: [
      { to: "/inbox", label: "Inbox intelligence", icon: Inbox, description: "Search & understand every scanned email" },
      { to: "/rules", label: "Rules", icon: WandSparkles, description: "Custom alerts and filing" },
    ],
  },
  {
    section: "System",
    items: [
      { to: "/accounts", label: "Mailboxes", icon: Mail, description: "Connected accounts & scanning" },
      { to: "/notifications", label: "Notifications", icon: BellRing, description: "Channels, schedule & email templates" },
      { to: "/settings", label: "Settings", icon: Settings, description: "Profile, security, AI and data" },
    ],
  },
];

export const ALL_NAV: NavItem[] = NAV.flatMap((s) => s.items);

export const BOTTOM_NAV = ["/", "/alerts", "/subscriptions", "/money"];

export function titleFor(pathname: string): string {
  const exact = ALL_NAV.find((n) => n.to === pathname);
  if (exact) return exact.label === "Overview" ? "Adminak" : exact.label;
  const prefix = ALL_NAV.filter((n) => n.to !== "/" && pathname.startsWith(n.to)).sort((a, b) => b.to.length - a.to.length)[0];
  return prefix?.label ?? "Adminak";
}
