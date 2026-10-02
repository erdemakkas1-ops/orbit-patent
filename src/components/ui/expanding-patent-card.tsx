import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface ExpandingPatentCardProps {
  children: ReactNode;
  selected?: boolean;
  className?: string;
}

export function ExpandingPatentCard({
  children,
  selected = false,
  className,
}: ExpandingPatentCardProps) {
  return (
    <article
      className={cn("expanding-patent-card", className)}
      data-selected={selected || undefined}
    >
      {children}
    </article>
  );
}
