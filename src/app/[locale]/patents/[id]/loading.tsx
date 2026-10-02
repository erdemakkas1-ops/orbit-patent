import { Skeleton } from "@/components/ui/skeleton";

export default function PatentDetailLoading() {
  return (
    <div aria-busy="true" aria-live="polite" className="space-y-6">
      <Skeleton className="h-6 w-40" />
      <Skeleton className="h-20 w-4/5" />
      <div className="detail-grid">
        <div className="space-y-6">
          <Skeleton className="h-72" />
          <Skeleton className="h-96" />
        </div>
        <div className="space-y-6">
          <Skeleton className="h-80" />
          <Skeleton className="h-72" />
        </div>
      </div>
    </div>
  );
}
