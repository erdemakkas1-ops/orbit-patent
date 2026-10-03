import { Skeleton } from "@/components/ui/skeleton";

export default function PatentDetailLoading() {
  return (
    <div aria-busy="true" className="space-y-6">
      <Skeleton className="h-5 w-40" />
      <div className="detail-hero">
        <Skeleton className="h-80 w-full" />
        <div className="space-y-4">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      </div>
      <div className="detail-grid">
        <Skeleton className="h-72" />
        <Skeleton className="h-72" />
      </div>
    </div>
  );
}
