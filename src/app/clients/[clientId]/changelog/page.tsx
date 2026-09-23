import { ComingSoon } from "@/components/dashboard/coming-soon";
import { requireClientAccess } from "@/server/auth/access";

export default async function Page(props: PageProps<"/clients/[clientId]/changelog">) {
  await requireClientAccess((await props.params).clientId);
  return <ComingSoon title="Changelog" phase={3} description="Manual optimization changelog, Meta-detected changes, and before/after change impact." />;
}
