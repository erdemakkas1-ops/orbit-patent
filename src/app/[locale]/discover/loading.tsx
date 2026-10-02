import { Skeleton } from "@/components/ui/skeleton";

export default function DiscoverLoading() {
  return (
    <div aria-busy="true" aria-live="polite" className="space-y-7">
      <Skeleton className="h-12 w-2/3" />
      <Skeleton className="h-28 w-full" />
      <div className="grid-cards">
        {[1, 2, 3, 4, 5, 6].map((item) => (
          <Skeleton key={item} className="h-[28rem]" />
        ))}
      </div>
    </div>
  );
}
