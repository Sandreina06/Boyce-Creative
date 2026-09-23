import { ComingSoon } from "@/components/dashboard/coming-soon";
import { requireClientAccess } from "@/server/auth/access";

export default async function Page(props: PageProps<"/clients/[clientId]/creative">) {
  await requireClientAccess((await props.params).clientId);
  return <ComingSoon title="Creative" phase={5} description="Creative winners, fatigue (frequency ↑ + CTR ↓ + CPA ↑), underperformers and scaling candidates." />;
}
