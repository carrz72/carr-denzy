import { ListSkeleton, PageHeaderSkeleton } from "@/components/ui/route-skeletons";

export default function Loading() {
  return (
    <>
      <PageHeaderSkeleton />
      <ListSkeleton rows={6} />
    </>
  );
}
