import { redirect } from "next/navigation";

export default function CommissionsRedirectPage() {
  redirect("/finance/config?tab=commissions");
}
