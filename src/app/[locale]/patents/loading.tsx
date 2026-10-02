import { Skeleton } from "@/components/ui/skeleton";

export default function PatentSearchLoading() {
  return (
    <div aria-busy="true" aria-live="polite" className="space-y-6">
      <Skeleton className="h-12 w-2/3" />
      <Skeleton className="h-48 w-full" />
      <div className="grid-cards">
        {[1, 2, 3, 4, 5, 6].map((item) => (
          <Skeleton key={item} className="h-96" />
        ))}
      </div>
    </div>
  );
}
