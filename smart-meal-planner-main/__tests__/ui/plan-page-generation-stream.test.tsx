// @vitest-environment jsdom
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("~/trpc/react", () => ({
  api: {
    plans: {
      getActivePlan: { useQuery: vi.fn() },
      getHistory: { useQuery: vi.fn() },
      getHistoryPlanById: { useQuery: vi.fn() },
      regenerateFull: { useMutation: vi.fn() },
      regenerateDay: { useMutation: vi.fn() },
      swapMeal: { useMutation: vi.fn() },
      restorePlan: { useMutation: vi.fn() },
    },
    plan: {
      generate: { useMutation: vi.fn() },
    },
    feedback: {
      getForPlan: { useQuery: vi.fn() },
      rate: { useMutation: vi.fn() },
    },
    shoppingList: {
      generateList: { useMutation: vi.fn() },
      getLists: { useQuery: vi.fn() },
    },
    useUtils: vi.fn(),
  },
}));

vi.mock("~/hooks/useGenerationStream", () => ({
  useGenerationStream: vi.fn(),
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    className,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/plan",
  useSearchParams: () => new URLSearchParams(),
}));

import PlannerPage from "~/app/(protected)/plan/page";
import { useGenerationStream } from "~/hooks/useGenerationStream";
import { api } from "~/trpc/react";

const mockUseGenerationStream = useGenerationStream as ReturnType<typeof vi.fn>;
const mockUseActivePlanQuery = api.plans.getActivePlan.useQuery as ReturnType<typeof vi.fn>;
const mockUseHistoryQuery = api.plans.getHistory.useQuery as ReturnType<typeof vi.fn>;
const mockUseHistoryPlanQuery = api.plans.getHistoryPlanById.useQuery as ReturnType<typeof vi.fn>;
const mockUseGenerateMutation = api.plan.generate.useMutation as ReturnType<typeof vi.fn>;
const mockUseRegenerateFullMutation = api.plans.regenerateFull.useMutation as ReturnType<typeof vi.fn>;
const mockUseRegenerateDayMutation = api.plans.regenerateDay.useMutation as ReturnType<typeof vi.fn>;
const mockUseSwapMealMutation = api.plans.swapMeal.useMutation as ReturnType<typeof vi.fn>;
const mockUseRestorePlanMutation = api.plans.restorePlan.useMutation as ReturnType<typeof vi.fn>;
const mockUseFeedbackQuery = api.feedback.getForPlan.useQuery as ReturnType<typeof vi.fn>;
const mockUseFeedbackRateMutation = api.feedback.rate.useMutation as ReturnType<typeof vi.fn>;
const mockUseGenerateListMutation = api.shoppingList.generateList.useMutation as ReturnType<typeof vi.fn>;
const mockUseShoppingListsQuery = api.shoppingList.getLists.useQuery as ReturnType<typeof vi.fn>;
const mockUseUtils = api.useUtils as ReturnType<typeof vi.fn>;

const renderWithProvider = (ui: React.ReactElement) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
};

const createStreamState = (
  overrides: Partial<ReturnType<typeof useGenerationStream>> = {},
) => ({
  connectionStatus: "disconnected" as const,
  isGenerating: false,
  days: {},
  retryMessages: {},
  completedDays: 0,
  failedDays: 0,
  terminalStatus: null,
  error: null,
  reset: vi.fn(),
  ...overrides,
});

const createIdleMutation = (overrides: Record<string, unknown> = {}) => ({
  mutate: vi.fn(),
  isPending: false,
  isError: false,
  ...overrides,
});

describe("PlannerPage generation streaming flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query === "(min-width: 768px)",
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });

    mockUseUtils.mockReturnValue({
      plans: { getActivePlan: { invalidate: vi.fn() } },
      feedback: {
        getForPlan: { invalidate: vi.fn(), cancel: vi.fn(), setData: vi.fn(), getData: vi.fn() },
      },
    });

    mockUseActivePlanQuery.mockReturnValue({
      data: null,
      isLoading: false,
      refetch: vi.fn().mockResolvedValue({}),
    });
    mockUseHistoryPlanQuery.mockReturnValue({
      data: null,
      isLoading: false,
      refetch: vi.fn(),
    });
    mockUseHistoryQuery.mockReturnValue({
      data: { plans: [], total: 0 },
      isFetching: false,
      refetch: vi.fn(),
    });
    mockUseFeedbackQuery.mockReturnValue({
      data: {},
      isLoading: false,
      refetch: vi.fn(),
    });
    mockUseShoppingListsQuery.mockReturnValue({
      data: [],
      isLoading: false,
      refetch: vi.fn(),
    });

    mockUseGenerateMutation.mockImplementation(
      (options?: { onSuccess?: (data: { planId: string }) => void }) => ({
        mutate: vi.fn(() => {
          options?.onSuccess?.({ planId: "new-plan-123" });
        }),
        isPending: false,
      }),
    );

    mockUseRegenerateFullMutation.mockImplementation(
      (options?: { onSuccess?: (data: { planId: string }) => void }) => ({
        mutate: vi.fn(() => {
          options?.onSuccess?.({ planId: "regen-plan-999" });
        }),
        isPending: false,
      }),
    );

    mockUseRegenerateDayMutation.mockReturnValue(createIdleMutation());
    mockUseSwapMealMutation.mockReturnValue(createIdleMutation());
    mockUseRestorePlanMutation.mockReturnValue(createIdleMutation());
    mockUseFeedbackRateMutation.mockReturnValue(createIdleMutation());
    mockUseGenerateListMutation.mockReturnValue(createIdleMutation());
  });

  it("uses the immediate generate response planId to enter the streaming flow", async () => {
    mockUseGenerationStream.mockReturnValue(createStreamState());

    renderWithProvider(<PlannerPage />);

    const generateBtn = screen.getByRole("button", { name: /generate master plan/i });
    fireEvent.click(generateBtn);

    await waitFor(() => {
      expect(mockUseGenerationStream).toHaveBeenCalledWith("new-plan-123");
    });
  });

  it("renders generation progress UI while generation is in flight", () => {
    mockUseGenerateMutation.mockReturnValue(createIdleMutation({ isPending: true }));
    mockUseGenerationStream.mockReturnValue(
      createStreamState({
        connectionStatus: "connected",
        isGenerating: true,
        days: {
          1: { dayNumber: 1, status: "success", failureReason: null, id: "day-1" },
          2: { dayNumber: 2, status: "generating", failureReason: null, id: "day-2" },
        },
        completedDays: 1,
      }),
    );

    renderWithProvider(<PlannerPage />);

    expect(screen.getByText(/orchestrating your plan/i)).toBeInTheDocument();
    expect(screen.getByText(/generating day by day... \(1\/4\)/i)).toBeInTheDocument();
    expect(screen.getByText(/3 remaining/i)).toBeInTheDocument();
    expect(screen.getByText(/day 2/i)).toBeInTheDocument();
  });

  it("renders amber retry notice when a day_allergen_retry message exists", () => {
    mockUseGenerateMutation.mockReturnValue(createIdleMutation({ isPending: true }));
    mockUseGenerationStream.mockReturnValue(
      createStreamState({
        connectionStatus: "connected",
        isGenerating: true,
        days: {
          2: { dayNumber: 2, status: "generating", failureReason: null, id: "day-2" },
        },
        retryMessages: {
          2: "Allergen retry for dinner on day 2 (attempt 1/2).",
        },
      }),
    );

    renderWithProvider(<PlannerPage />);

    const retryNotice = screen.getByText(
      /allergen retry for dinner on day 2 \(attempt 1\/2\)\./i,
    );
    expect(retryNotice).toBeInTheDocument();
    expect(retryNotice).toHaveClass("text-amber-500");
    expect(retryNotice).toHaveClass("bg-amber-500/10");
    expect(retryNotice).toHaveClass("border-amber-500/20");
  });

  it("renders the success terminal state when the stream completes", async () => {
    mockUseGenerationStream.mockReturnValue(
      createStreamState({
        isGenerating: true,
        terminalStatus: "completed",
        days: {
          1: { dayNumber: 1, status: "success", failureReason: null },
        },
        completedDays: 1,
      }),
    );

    renderWithProvider(<PlannerPage />);

    await waitFor(() => {
      expect(screen.getByText(/Generation Complete!/i)).toBeInTheDocument();
      expect(screen.getByText(/Generated 1 days successfully/i)).toBeInTheDocument();
    });
  });

  it("renders partial failure details when a failed day is present", async () => {
    mockUseGenerationStream.mockReturnValue(
      createStreamState({
        isGenerating: true,
        terminalStatus: "partial_failure",
        days: {
          1: { dayNumber: 1, status: "success", failureReason: null },
          2: { dayNumber: 2, status: "failed", failureReason: "AI Timeout" },
        },
        completedDays: 1,
        failedDays: 1,
      }),
    );

    renderWithProvider(<PlannerPage />);

    await waitFor(() => {
      expect(screen.getByText(/Generation Completed with Errors/i)).toBeInTheDocument();
      expect(screen.getByText(/Day 2:/i)).toBeInTheDocument();
      expect(screen.getAllByText(/AI Timeout/i).length).toBeGreaterThan(0);
    });
  });

  it("renders generation progress UI immediately if activePlan is in in_progress state", () => {
    mockUseActivePlanQuery.mockReturnValue({
      data: { id: "existing-plan-456", generationStatus: "in_progress", days: [] },
      isLoading: false,
      refetch: vi.fn().mockResolvedValue({}),
    });
    mockUseGenerationStream.mockReturnValue(
      createStreamState({
        isGenerating: true,
      }),
    );

    renderWithProvider(<PlannerPage />);

    expect(mockUseGenerationStream).toHaveBeenCalledWith("existing-plan-456");
    expect(screen.getByText(/Orchestrating Your Plan/i)).toBeInTheDocument();
  });

  it("renders a reconnecting state when connectionStatus is connecting and there is an error", () => {
    mockUseGenerationStream.mockReturnValue(
      createStreamState({
        connectionStatus: "connecting",
        error: "Network lost",
        isGenerating: true,
      }),
    );

    renderWithProvider(<PlannerPage />);

    expect(screen.getAllByText(/Reconnecting/i).length).toBeGreaterThan(0);
  });

  it("uses the immediate regenerateFull response planId to enter the streaming flow", async () => {
    mockUseActivePlanQuery.mockReturnValue({
      data: { id: "old-plan", planDays: 3, days: [] },
      isLoading: false,
      refetch: vi.fn().mockResolvedValue({}),
    });
    mockUseGenerationStream.mockReturnValue(createStreamState());
    vi.spyOn(window, "confirm").mockReturnValue(true);

    renderWithProvider(<PlannerPage />);

    const regenBtn = screen.getByRole("button", { name: /Regenerate/i });
    fireEvent.click(regenBtn);

    await waitFor(() => {
      expect(mockUseGenerationStream).toHaveBeenCalledWith("regen-plan-999");
    });
  });
});
