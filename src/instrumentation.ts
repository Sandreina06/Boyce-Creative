/**
 * Runs once when the Next.js server starts. Starts the background data sync
 * (Node.js runtime only; skipped during `next build`).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  if (!process.env.DATABASE_URL) return;
  const { startBackgroundSync } = await import("./server/jobs/background-sync");
  startBackgroundSync();
}
