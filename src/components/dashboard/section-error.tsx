import { AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

/** Shown in place of a section whose data could not be loaded, so the rest of the page still works. */
export function SectionError({ title, message }: { title: string; message: string }) {
  return (
    <Card>
      <CardContent className="flex gap-3 pt-5 text-sm">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
        <div>
          <div className="font-semibold">{title} couldn&apos;t load</div>
          <p className="mt-0.5 text-xs text-muted-foreground">{message}</p>
          <p className="mt-1 text-xs text-muted-foreground">The rest of the page is unaffected. Data is retried automatically; reload in a minute.</p>
        </div>
      </CardContent>
    </Card>
  );
}

export async function settle<T>(p: Promise<T>): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    return { ok: true, data: await p };
  } catch (err) {
    console.error("[section]", err);
    return { ok: false, error: (err as Error)?.message ?? "Unknown error" };
  }
}
