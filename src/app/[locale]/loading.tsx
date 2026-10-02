import { Skeleton } from "@/components/ui/skeleton";
export default function Loading() {
  return (
    <div aria-busy="true" className="space-y-6">
      <Skeleton className="h-12 w-2/3" />
      <Skeleton className="h-44 w-full" />
      <div className="grid-cards">
        {[1, 2, 3].map((n) => (
          <Skeleton key={n} className="h-80" />
        ))}
      </div>
    </div>
  );
}
