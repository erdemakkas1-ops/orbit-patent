"use client";
import { useParams } from "next/navigation";
import Link from "next/link";
import { messages } from "@/lib/i18n/messages";
export default function NotFound() {
  const { locale } = useParams();
  const l = locale === "en" ? "en" : "tr";
  const m = messages[l];
  return (
    <div className="panel">
      <p className="eyebrow">ORBIT / 404</p>
      <h1 className="my-5">{m.pageNotFound}</h1>
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        <Link className="card-action font-semibold" href={`/${l}`}>
          {m.home}
        </Link>
        <Link className="card-action font-semibold" href={`/${l}/patents`}>
          {m.back}
        </Link>
      </div>
    </div>
  );
}
