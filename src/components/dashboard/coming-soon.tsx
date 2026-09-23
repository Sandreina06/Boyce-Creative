import { Card, CardContent } from "@/components/ui/card";

export function ComingSoon({ title, phase, description }: { title: string; phase: number; description: string }) {
  return (
    <Card>
      <CardContent className="py-10 text-center">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Phase {phase}</div>
        <h2 className="mt-1 text-lg font-semibold">{title}</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}
