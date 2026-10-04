"use client";
import Link, { useLinkStatus } from "next/link";
import type { ComponentProps } from "react";

function PendingMark() {
  const { pending } = useLinkStatus();
  return (
    <span className="pending-mark" data-pending={pending} aria-hidden="true" />
  );
}

/**
 * A filter link that reacts the moment it is clicked. Changing only the query
 * keeps the old page on screen until the new one is ready, so the pending mark
 * drives the feedback: the clicked filter shows a spinner and the results
 * area dims (see .discover-results in globals.css).
 */
export function FilterLink({
  children,
  ...props
}: ComponentProps<typeof Link>) {
  return (
    <Link {...props}>
      {children}
      <PendingMark />
    </Link>
  );
}
