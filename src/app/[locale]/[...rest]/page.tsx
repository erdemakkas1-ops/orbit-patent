import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLocale, messages } from "@/lib/i18n/messages";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: messages[isLocale(locale) ? locale : "tr"].pageNotFound,
    robots: { index: false },
  };
}

// Unknown paths under a locale render [locale]/not-found inside the site layout.
export default function CatchAll() {
  notFound();
}
