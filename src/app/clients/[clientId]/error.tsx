"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function ClientError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <Card>
      <CardContent className="space-y-3 py-10 text-center">
        <h2 className="text-base font-semibold">This page couldn&apos;t load its data</h2>
        <p className="mx-auto max-w-md text-sm text-muted-foreground">
          Windsor or Meta didn&apos;t respond in time. Other clients and pages still work. Try again in a moment.
        </p>
        {error.digest && <p className="text-[11px] text-muted-foreground">Reference: {error.digest}</p>}
        <Button onClick={reset}>Try again</Button>
      </CardContent>
    </Card>
  );
}
