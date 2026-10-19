// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("~/trpc/react", () => ({
  api: {
    household: {
      get: { useQuery: vi.fn() },
    },
    user: {
      updateProfile: { useMutation: vi.fn() },
    },
    useUtils: vi.fn(),
  },
}));

import HouseholdPage from "~/app/(protected)/household/page";
import { api } from "~/trpc/react";

const mockGetProfileQuery = api.household.get.useQuery as ReturnType<typeof vi.fn>;
const mockUpdateProfileMutation = api.user.updateProfile.useMutation as ReturnType<typeof vi.fn>;
const mockUseUtils = api.useUtils as ReturnType<typeof vi.fn>;

const profileFixture = {
  adults: 3,
  children: 1,
  toddlers: 1,
  dietTypes: ["vegetarian"],
  allergens: ["peanuts"],
  dislikes: ["cilantro"],
  weeklyBudgetEuro: 90,
  portionMultipliers: { adult: 1.25, child: 0.8, toddler: 0.6 },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("alert", vi.fn());
  mockUseUtils.mockReturnValue({});
  mockGetProfileQuery.mockReturnValue({ data: profileFixture, isLoading: false });
  mockUpdateProfileMutation.mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
    isError: false,
  });
});

describe("HouseholdPage", () => {
  it("uses canonical user.updateProfile with the household payload on save", async () => {
    const mutate = vi.fn();
    mockUpdateProfileMutation.mockReturnValue({
      mutate,
      isPending: false,
      isError: false,
    });

    render(<HouseholdPage />);

    await waitFor(() => {
      expect(screen.getByDisplayValue("90")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /save profile/i }));

    expect(mutate).toHaveBeenCalledWith({
      adults: 3,
      children: 1,
      toddlers: 1,
      dietTypes: ["vegetarian"],
      allergens: ["peanuts"],
      dislikes: ["cilantro"],
      weeklyBudgetEuro: 90,
      portionMultipliers: { adult: 1.25, child: 0.8, toddler: 0.6 },
    });
  });
});