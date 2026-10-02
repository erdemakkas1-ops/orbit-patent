import { Skeleton } from "@/components/ui/skeleton";

export default function AiSearchLoading() {
  return (
    <div aria-busy="true" aria-live="polite" className="space-y-6">
      <Skeleton className="h-12 w-2/3" />
      <Skeleton className="h-64 max-w-3xl" />
      <Skeleton className="h-44 w-full" />
    </div>
  );
}
