import { PageHeaderSkeleton, DashboardSkeleton } from "@/components/ui/route-skeletons";

/**
 * Streamed immediately on navigation so the shell paints on tap rather than
 * after the server finishes querying. See route-skeletons.tsx for why.
 */
export default function Loading() {
  return (
    <>
      <PageHeaderSkeleton />
      <DashboardSkeleton />
    </>
  );
}
