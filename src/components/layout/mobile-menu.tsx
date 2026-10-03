"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import type { Locale } from "@/types/patent";
import { messages } from "@/lib/i18n/messages";
import { LocaleSwitcher } from "./locale-switcher";
import { NavLinks } from "./nav-links";
export function MobileMenu({ locale }: { locale: Locale }) {
  const pathname = usePathname();
  // The menu belongs to the page it was opened on, so any navigation closes it.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const setOpen = (value: boolean) => setOpenOn(value ? pathname : null);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const m = messages[locale];
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpenOn(null);
      button.current?.focus();
    };
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpenOn(null);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);
  return (
    <div className="mobile-menu" ref={root}>
      <button
        ref={button}
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
          <NavLinks
            locale={locale}
            className="mobile-nav-link block rounded px-3 py-2"
            onNavigate={() => setOpen(false)}
          />
          <div className="site-footer mt-2 border-t pt-3">
            <LocaleSwitcher locale={locale} />
          </div>
        </nav>
      )}
    </div>
  );
}
