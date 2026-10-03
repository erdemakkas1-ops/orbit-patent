import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export interface ExpandingPatentCardProps {
  children: ReactNode;
  href: string;
  ariaLabel: string;
  className?: string;
}

export function ExpandingPatentCard({
  children,
  href,
  ariaLabel,
  className,
}: ExpandingPatentCardProps) {
  return (
    <article className={cn("expanding-patent-card", className)}>
      <Link className="patent-card-link" href={href} aria-label={ariaLabel}>
        {children}
      </Link>
    </article>
  );
}
