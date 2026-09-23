import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import { Card, CardContent } from "@/components/ui/card";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/agency");
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Boyce Creative</div>
          <h1 className="mt-1 text-xl font-semibold tracking-tight">Boyce Meta Intelligence</h1>
        </div>
        <Card>
          <CardContent className="pt-5">
            <LoginForm />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
