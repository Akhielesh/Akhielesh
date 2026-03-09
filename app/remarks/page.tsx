import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight, MessageSquareMore } from "lucide-react";

import { guestbookRepo, linkedinProfileUrl, siteName } from "@/content/site";
import { RemarksEmbed } from "@/components/remarks-embed";
import { Reveal } from "@/components/reveal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Remarks",
  description: "Public remarks and comments about Akhielesh and his product work."
};

export default function RemarksPage() {
  return (
    <div className="mx-auto max-w-7xl px-5 py-12 sm:px-8 sm:py-16">
      <Reveal className="space-y-10">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Button asChild variant="ghost" size="sm">
            <Link href="/#live-signal">
              <ArrowLeft className="size-4" />
              Back to live signal
            </Link>
          </Button>
          <Badge variant="accent">Public guestbook</Badge>
        </div>

        <div className="grid gap-10 lg:grid-cols-[minmax(0,1.02fr)_320px] lg:items-end">
          <div>
            <p className="eyebrow-label">Remarks / Guestbook</p>
            <h1 className="mt-4 max-w-4xl font-display text-5xl leading-[0.94] tracking-tight text-foreground sm:text-6xl">
              Leave a public note about the work, the products, or what stood out.
            </h1>
            <p className="mt-6 max-w-3xl text-lg leading-8 text-muted-foreground">
              This page is the public comments surface for the portfolio. Notes left here are meant to be visible, durable, and easy to
              reference later instead of disappearing inside private chats.
            </p>
          </div>

          <div className="panel-shell rounded-[2rem] border border-white/10 p-6">
            <p className="eyebrow-label">How it works</p>
            <div className="mt-4 grid gap-3">
              <div className="rounded-[1.2rem] border border-white/8 bg-black/20 px-4 py-4 text-sm leading-6 text-foreground/84">
                GitHub-backed public comments via the <span className="text-foreground">{guestbookRepo}</span> repo.
              </div>
              <div className="rounded-[1.2rem] border border-white/8 bg-black/20 px-4 py-4 text-sm leading-6 text-foreground/84">
                Best for collaboration notes, product impressions, and portfolio feedback.
              </div>
              <div className="rounded-[1.2rem] border border-white/8 bg-black/20 px-4 py-4 text-sm leading-6 text-foreground/84">
                If you prefer private contact, use email or LinkedIn from the home page.
              </div>
            </div>
          </div>
        </div>
      </Reveal>

      <Reveal delay={0.08} variant="pop" className="mt-12">
        <div className="panel-shell rounded-[2.2rem] border border-white/10 p-6 sm:p-7">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="inline-flex items-center gap-3">
                <MessageSquareMore className="size-4 text-muted-foreground" />
                <p className="eyebrow-label">Public thread</p>
              </div>
              <h2 className="mt-3 font-display text-4xl leading-none tracking-tight text-foreground">
                Add your remark
              </h2>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button asChild variant="outline" size="sm">
                <Link href={`https://github.com/${guestbookRepo}/issues`} target="_blank" rel="noreferrer">
                  View guestbook issues
                  <ArrowUpRight className="size-4" />
                </Link>
              </Button>
              <Button asChild variant="ghost" size="sm">
                <Link href={linkedinProfileUrl} target="_blank" rel="noreferrer">
                  Message on LinkedIn
                  <ArrowUpRight className="size-4" />
                </Link>
              </Button>
            </div>
          </div>

          <div className="soft-divider my-6" />
          <RemarksEmbed />
        </div>
      </Reveal>

      <Reveal delay={0.14} className="mt-8">
        <div className="rounded-[1.6rem] border border-white/10 bg-white/[0.03] p-5 text-sm leading-7 text-muted-foreground">
          If the comment widget looks empty the first time, it usually means the GitHub guestbook app has not been activated for{" "}
          <span className="text-foreground">{siteName}</span> yet. The page is already wired for it.
        </div>
      </Reveal>
    </div>
  );
}
