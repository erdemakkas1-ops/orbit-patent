"use client";
import { useParams } from "next/navigation";
import Link from "next/link";
import { messages } from "@/lib/i18n/messages";
import { Button } from "@/components/ui/button";
export default function PatentAnalysisError({
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  const { locale } = useParams();
  const m = messages[locale === "en" ? "en" : "tr"];
  return (
    <div role="alert" className="panel">
      <h1 className="mb-4 text-2xl">{m.patentUnavailable}</h1>
      <div className="flex flex-wrap gap-3">
        <Button onClick={reset}>{m.retry}</Button>
        <Button asChild variant="outline">
          <Link href={`/${locale === "en" ? "en" : "tr"}/patents`}>
            {m.back}
          </Link>
        </Button>
      </div>
    </div>
  );
}
