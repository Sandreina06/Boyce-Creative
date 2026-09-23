import { ComingSoon } from "@/components/dashboard/coming-soon";
import { requireClientAccess } from "@/server/auth/access";

export default async function Page(props: PageProps<"/clients/[clientId]/ads">) {
  await requireClientAccess((await props.params).clientId);
  return <ComingSoon title="Ads" phase={2} description="Ad table flagging high spend / low performance, high CPA, low CTR and high frequency." />;
}
