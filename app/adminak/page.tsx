import type { Metadata } from "next";

import { AdminAkExperience } from "@/components/adminak-experience";

export const metadata: Metadata = {
  title: "Adminak",
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
      nosnippet: true
    }
  }
};

export default function AdminAkPage() {
  return <AdminAkExperience />;
}
