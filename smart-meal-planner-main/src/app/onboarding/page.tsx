import { redirect } from "next/navigation";
import { getSession } from "~/server/auth";
import { api } from "~/trpc/server";
import { OnboardingWizard } from "./_components/OnboardingWizard";

export default async function OnboardingPage() {
    const session = await getSession();

    if (!session?.user) {
        redirect("/login");
    }

    try {
        const consentStatus = await api.user.getConsentStatus();
        if (consentStatus.hasConsented) {
            redirect("/dashboard");
        }
    } catch {
        // Session not available at build time - safe to continue
    }

    return (
        <div className="flex min-h-screen items-center justify-center p-4">
            <OnboardingWizard />
        </div>
    );
}
