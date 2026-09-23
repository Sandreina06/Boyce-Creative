import { redirect } from "next/navigation";

export default async function ClientIndex(props: PageProps<"/clients/[clientId]">) {
  const { clientId } = await props.params;
  redirect(`/clients/${clientId}/overview`);
}
