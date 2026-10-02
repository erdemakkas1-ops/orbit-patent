import Link from "next/link";
import { messages } from "@/lib/i18n/messages";

export default function NotFound() {
  const m = messages.tr;
  return (
    <main className="shell py-12">
      <div className="panel">
        <p className="eyebrow">ORBIT / 404</p>
        <h1 className="my-5">{m.pageNotFound}</h1>
        <p className="muted">{m.noData}</p>
        <Link className="card-action font-semibold" href="/tr">
          {m.home}
        </Link>
      </div>
    </main>
  );
}
