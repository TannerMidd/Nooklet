import { PageSkeleton } from "@/components/ui/page-skeleton";

export default function ActivityLoading() {
  return <PageSkeleton cards={4} rows={3} />;
}
