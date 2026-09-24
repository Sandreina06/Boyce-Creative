import { PageLoading } from "@/components/shell/page-loading";

export default function Loading() {
  return (
    <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6">
      <div className="mb-6">
        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Boyce Creative</div>
        <div className="text-xl font-semibold tracking-tight">Agency overview</div>
      </div>
      <PageLoading what="all clients" />
    </main>
  );
}
