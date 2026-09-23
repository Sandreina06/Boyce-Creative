import { ComingSoon } from "@/components/dashboard/coming-soon";
import { requireClientAccess } from "@/server/auth/access";

export default async function Page(props: PageProps<"/clients/[clientId]/insights">) {
  await requireClientAccess((await props.params).clientId);
  return <ComingSoon title="Insights" phase={4} description="Deterministic insights with root-cause decomposition (CPM · CTR · CVR) and account → campaign → ad set → ad drilldown." />;
}
