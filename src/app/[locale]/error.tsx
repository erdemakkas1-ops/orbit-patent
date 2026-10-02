"use client";
import { useParams } from "next/navigation";
import { messages } from "@/lib/i18n/messages";
import { Button } from "@/components/ui/button";
export default function ErrorPage({
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  const { locale } = useParams();
  const m = messages[locale === "en" ? "en" : "tr"];
  return (
    <div role="alert" className="panel">
      <h2>{m.unexpected}</h2>
      <Button onClick={reset}>{m.retry}</Button>
    </div>
  );
}
