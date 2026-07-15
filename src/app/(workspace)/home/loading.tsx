import { PageSkeleton } from "@/components/ui/page-skeleton";

export default function HomeLoading() {
  return <PageSkeleton cards={4} rows={2} />;
}
