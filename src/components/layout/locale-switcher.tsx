"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { Locale } from "@/types/patent";
export function LocaleSwitcher({ locale }: { locale: Locale }) {
  const path = usePathname();
  const search = useSearchParams().toString();
  return (
    <span className="locale-switcher flex gap-2 border-l pl-5">
      {(["tr", "en"] as const).map((l) => (
        <Link
          key={l}
          lang={l}
          aria-current={l === locale ? "true" : undefined}
          className={
            l === locale ? "locale-active font-bold" : "locale-passive"
          }
          href={
            path.replace(/^\/(tr|en)(?=\/|$)/, `/${l}`) +
            (search ? `?${search}` : "")
          }
        >
          {l.toUpperCase()}
        </Link>
      ))}
    </span>
  );
}
