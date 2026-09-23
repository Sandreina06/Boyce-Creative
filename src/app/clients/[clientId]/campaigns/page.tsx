import { ComingSoon } from "@/components/dashboard/coming-soon";
import { requireClientAccess } from "@/server/auth/access";

export default async function Page(props: PageProps<"/clients/[clientId]/campaigns">) {
  await requireClientAccess((await props.params).clientId);
  return <ComingSoon title="Campaigns" phase={2} description="Campaign table with sorting, filtering, search and comparison, plus campaign drilldowns." />;
}
