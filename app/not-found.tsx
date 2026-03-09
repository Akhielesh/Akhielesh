import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-3xl flex-col items-start justify-center px-5 py-20 sm:px-8">
      <p className="font-mono text-[11px] uppercase tracking-[0.34em] text-muted-foreground">Not found</p>
      <h1 className="mt-4 font-display text-5xl leading-none tracking-tight text-foreground">
        That case study is not part of this build.
      </h1>
      <p className="mt-5 max-w-xl text-base leading-8 text-muted-foreground">
        The current public route surface is intentionally tight: one homepage and two serious project case studies.
      </p>
      <Button asChild className="mt-8">
        <Link href="/">Return home</Link>
      </Button>
    </div>
  );
}
