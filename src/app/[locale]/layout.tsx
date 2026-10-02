import { notFound } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";
import { isLocale, messages } from "@/lib/i18n/messages";
import { LocaleSwitcher } from "@/components/layout/locale-switcher";
import { MobileMenu } from "@/components/layout/mobile-menu";
import { NavLinks } from "@/components/layout/nav-links";
import type { Metadata } from "next";
import { buildMetadata, seoCopy } from "@/lib/seo";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: value } = await params;
  const locale = isLocale(value) ? value : "tr";
  const metadata = buildMetadata(locale);
  return {
    ...metadata,
    title: { default: seoCopy[locale].homeTitle, template: "%s | ORBIT" },
  };
}
export default async function Layout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const m = messages[locale];
  return (
    <html lang={locale}>
      <body>
        <a href="#main" className="skip">
          {m.skip}
        </a>
        <header className="site-header relative border-b">
          <div className="shell flex min-h-20 items-center justify-between gap-8 py-4">
            <Link href={`/${locale}`} className="brand-mark text-2xl font-bold">
              ORBIT
            </Link>
            <nav className="desktop-nav flex flex-wrap items-center gap-7 text-sm font-medium">
              <NavLinks locale={locale} />
              <Suspense>
                <LocaleSwitcher locale={locale} />
              </Suspense>
            </nav>
            <MobileMenu locale={locale} />
          </div>
        </header>
        <main id="main" className="shell py-12">
          {children}
        </main>
        <footer className="site-footer shell border-t py-7 text-sm muted">
          {m.footer}
        </footer>
      </body>
    </html>
  );
}
