import { redirect } from "next/navigation";
import { getSession } from "~/server/auth";
import { api } from "~/trpc/server";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();

  if (!session?.user) {
    redirect("/login");
  }

  const consentStatus = await api.user.getConsentStatus();

  if (!consentStatus.hasConsented) {
    redirect("/onboarding");
  }

  return <>{children}</>;
}
