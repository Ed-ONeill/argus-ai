"use client";

// ExploreLink — the curiosity affordance (§A⁶). A quiet, consistent invitation to go
// deeper into an entity via the existing /explore route, so finishing a brief section
// always offers a rewarding next click rather than a dead end.

import Link from "next/link";
import { cn } from "@/lib/utils";

export function ExploreLink({ label, entity, className }: { label: string; entity: string; className?: string }) {
  return (
    <Link
      href={`/explore/${encodeURIComponent(entity)}`}
      className={cn(
        "group inline-flex items-center gap-1 text-[11px] font-medium text-ink-muted transition-colors hover:text-accent motion-reduce:transition-none",
        className,
      )}
    >
      {label}
      <span aria-hidden className="transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none">→</span>
    </Link>
  );
}
