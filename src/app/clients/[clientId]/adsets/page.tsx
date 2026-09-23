import { ComingSoon } from "@/components/dashboard/coming-soon";
import { requireClientAccess } from "@/server/auth/access";

export default async function Page(props: PageProps<"/clients/[clientId]/adsets">) {
  await requireClientAccess((await props.params).clientId);
  return <ComingSoon title="Ad sets" phase={2} description="Ad set table with targeting (from Windsor adset_targeting), budgets and drilldowns." />;
}
