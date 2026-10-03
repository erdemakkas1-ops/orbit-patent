import Link from "next/link";
import { messages } from "@/lib/i18n/messages";

// The root layout has no <html> (it lives in [locale]/layout), so this page
// renders its own document for URLs outside any locale, e.g. /xx.
export default function NotFound() {
  const m = messages.tr;
  return (
    <html lang="tr">
      <body>
        <title>{`${m.pageNotFound} | ORBIT`}</title>
        <main className="shell py-12">
          <div className="panel">
            <p className="eyebrow">ORBIT / 404</p>
            <h1 className="my-5">{m.pageNotFound}</h1>
            <Link className="card-action font-semibold" href="/tr">
              {m.home}
            </Link>
          </div>
        </main>
      </body>
    </html>
  );
}
