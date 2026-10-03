"use client";
import { useParams } from "next/navigation";
import Link from "next/link";
import { messages } from "@/lib/i18n/messages";
export default function PatentNotFound() {
  const { locale } = useParams();
  const l = locale === "en" ? "en" : "tr";
  const m = messages[l];
  return (
    <div className="panel">
      <p className="eyebrow">ORBIT / 404</p>
      <h1 className="my-5">{m.notFound}</h1>
      <Link className="card-action font-semibold" href={`/${l}/patents`}>
        {m.back}
      </Link>
    </div>
  );
}
