"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Locale } from "@/types/patent";
import { messages } from "@/lib/i18n/messages";
export function NavLinks({
  locale,
  className = "nav-link",
  onNavigate,
}: {
  locale: Locale;
  className?: string;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const m = messages[locale];
  return (
    <>
      <Link
        className={className}
        onClick={onNavigate}
        aria-current={
          pathname.startsWith(`/${locale}/discover`) ? "page" : undefined
        }
        href={`/${locale}/discover`}
      >
        {m.discover}
      </Link>
      <Link
        className={className}
        onClick={onNavigate}
        aria-current={
          pathname.startsWith(`/${locale}/patents`) ? "page" : undefined
        }
        href={`/${locale}/patents`}
      >
        {m.search}
      </Link>
      <Link
        className={className}
        onClick={onNavigate}
        aria-current={
          pathname.startsWith(`/${locale}/ai-search`) ? "page" : undefined
        }
        href={`/${locale}/ai-search`}
      >
        {m.aiSearch}
      </Link>
    </>
  );
}
