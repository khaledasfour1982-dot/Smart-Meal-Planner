"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Label } from "~/components/ui/label";

export function OnboardingWizard() {
  const [accepted, setAccepted] = useState(false);
  const router = useRouter();

  const { mutate: acceptConsent, isPending } = api.user.acceptConsent.useMutation({
    onSuccess: () => {
      // force refresh of the SSR layout state
      router.refresh();
      // On success, go to household to actually set up real constraints
      router.push("/household");
    },
    onError: (err) => {
      console.error("Failed to accept consent:", err);
      alert("Failed to save consent. Please try again.");
    },
  });

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Welcome to Smart Meal Planner</CardTitle>
        <CardDescription>
          Before we begin, please review our data privacy policy.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          To provide personalized meal plans, we need to collect and store your
          dietary preferences, household composition, allergies, and ingredient
          dislikes. By proceeding, you consent to the processing of this personal
          data in accordance with our Privacy Policy.
        </p>

        <div className="flex items-center space-x-3 rounded-md border p-4 bg-muted/50">
          <input
            type="checkbox"
            id="consent"
            checked={accepted}
            onChange={(e) => setAccepted(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300"
          />
          <Label
            htmlFor="consent"
            className="text-sm font-medium leading-none cursor-pointer"
          >
            I accept the data processing terms
          </Label>
        </div>
      </CardContent>
      <CardFooter>
        <Button
          className="w-full"
          disabled={!accepted || isPending}
          onClick={() => acceptConsent({ accepted: true })}
        >
          {isPending ? "Saving..." : "Continue"}
        </Button>
      </CardFooter>
    </Card>
  );
}
