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
      <h1>{m.notFound}</h1>
      <Link href={`/${l}/patents`}>{m.back}</Link>
    </div>
  );
}
