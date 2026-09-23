import { ComingSoon } from "@/components/dashboard/coming-soon";
import { requireClientAccess } from "@/server/auth/access";

export default async function Page(props: PageProps<"/clients/[clientId]/pacing">) {
  await requireClientAccess((await props.params).clientId);
  return <ComingSoon title="Pacing" phase={2} description="Full pacing page with daily spend vs. required run rate. The pacing summary is already on Overview." />;
}
