"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { messages } from "@/lib/i18n/messages";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const params = useParams();
  const locale = params?.locale === "en" ? "en" : "tr";
  const m = messages[locale];
  return (
    <html lang={locale}>
      <body>
        <main className="shell py-12">
          <div role="alert" className="panel">
            <h1 className="mb-4 text-2xl">{m.unexpected}</h1>
            <button
              className="button-primary rounded-lg px-5 py-3 text-sm font-medium"
              onClick={reset}
            >
              {m.retry}
            </button>
            <Link
              className="card-action ml-4 text-sm font-semibold"
              href={`/${locale}`}
            >
              {m.home}
            </Link>
          </div>
        </main>
      </body>
    </html>
  );
}
