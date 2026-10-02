"use client";
import Link from "next/link";
import { useState } from "react";
import type { Locale } from "@/types/patent";
import { messages } from "@/lib/i18n/messages";
import { LocaleSwitcher } from "./locale-switcher";
export function MobileMenu({ locale }: { locale: Locale }) {
  const [open, setOpen] = useState(false);
  const m = messages[locale];
  return (
    <div className="mobile-menu">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="mobile-nav"
        aria-label={open ? m.closeMenu : m.openMenu}
        onClick={() => setOpen(!open)}
        className="mobile-menu-button rounded-lg px-3 py-2 text-sm"
      >
        {open ? "×" : "☰"}
      </button>
      {open && (
        <nav
          id="mobile-nav"
          className="mobile-nav absolute right-4 top-16 z-20 min-w-52 rounded-lg border p-3 shadow-xl"
        >
          <Link
            className="mobile-nav-link block rounded px-3 py-2"
            href={`/${locale}/discover`}
            onClick={() => setOpen(false)}
          >
            {m.discover}
          </Link>
          <Link
            className="mobile-nav-link block rounded px-3 py-2"
            href={`/${locale}/patents`}
            onClick={() => setOpen(false)}
          >
            {m.search}
          </Link>
          <Link
            className="mobile-nav-link block rounded px-3 py-2"
            href={`/${locale}/ai-search`}
            onClick={() => setOpen(false)}
          >
            {m.aiSearch}
          </Link>
          <div className="site-footer mt-2 border-t pt-3">
            <LocaleSwitcher locale={locale} />
          </div>
        </nav>
      )}
    </div>
  );
}
