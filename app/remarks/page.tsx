import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight, MessageSquareMore, Github, Linkedin } from "lucide-react";

import { guestbookRepo, linkedinProfileUrl } from "@/content/site";
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
            <Link href="/#contact">
              <ArrowLeft className="size-4" />
              Back to contact links
            </Link>
          </Button>
          <Badge variant="accent">Public guestbook</Badge>
          <h1 className="max-w-3xl font-display text-5xl leading-[0.94] tracking-tight text-foreground sm:text-6xl">
            Leave a remark
          </h1>
          <p className="max-w-2xl text-lg leading-8 text-muted-foreground">
            Share thoughts about the projects, the work, or anything that stood out. Comments are public and powered by GitHub Issues.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-[1.2rem] border border-white/[0.08] bg-white/[0.03] px-4 py-4">
            <div className="flex items-center gap-2">
              <Github className="size-4 text-muted-foreground" />
              <p className="text-sm font-medium text-foreground">Step 1</p>
            </div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">Sign in with your GitHub account below.</p>
          </div>
          <div className="rounded-[1.2rem] border border-white/[0.08] bg-white/[0.03] px-4 py-4">
            <div className="flex items-center gap-2">
              <MessageSquareMore className="size-4 text-muted-foreground" />
              <p className="text-sm font-medium text-foreground">Step 2</p>
            </div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">Write your comment in the box that appears.</p>
          </div>
          <div className="rounded-[1.2rem] border border-white/[0.08] bg-white/[0.03] px-4 py-4">
            <div className="flex items-center gap-2">
              <ArrowUpRight className="size-4 text-muted-foreground" />
              <p className="text-sm font-medium text-foreground">Step 3</p>
            </div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">Your remark posts as a GitHub Issue and shows up here.</p>
          </div>
        </div>
      </Reveal>

      <Reveal delay={0.08} variant="pop" className="mt-10">
        <div className="panel-shell rounded-[2.2rem] border border-white/10 p-6 sm:p-7">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="inline-flex items-center gap-3">
              <MessageSquareMore className="size-4 text-muted-foreground" />
              <h2 className="font-display text-2xl tracking-tight text-foreground">Comments</h2>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button asChild variant="outline" size="sm">
                <Link href={`https://github.com/${guestbookRepo}/issues`} target="_blank" rel="noreferrer">
                  View on GitHub
                  <ArrowUpRight className="size-4" />
                </Link>
              </Button>
              <Button asChild variant="ghost" size="sm">
                <Link href={linkedinProfileUrl} target="_blank" rel="noreferrer">
                  <Linkedin className="size-4" />
                  LinkedIn
                </Link>
              </Button>
            </div>
          </div>

          <div className="soft-divider my-5" />
          <RemarksEmbed />
        </div>
      </Reveal>

      <Reveal delay={0.14} className="mt-6">
        <p className="text-center text-xs text-muted-foreground">
          Comments are stored as GitHub Issues in{" "}
          <Link href={`https://github.com/${guestbookRepo}`} target="_blank" rel="noreferrer" className="text-foreground hover:underline">
            {guestbookRepo}
          </Link>
          . Powered by Utterances.
        </p>
      </Reveal>
    </div>
  );
}
