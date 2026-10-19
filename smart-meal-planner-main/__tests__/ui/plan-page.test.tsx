// @vitest-environment jsdom
/**
 * UI tests for src/app/(protected)/plan/page.tsx
 *
 * Strategy: mock ~/trpc/react so each test controls what
 * api.plans.getActivePlan.useQuery() and api.plan.generate.useMutation()
 * return, without touching the network or DB.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const pushMock = vi.fn();

// ---------------------------------------------------------------------------
// Module mocks – must be hoisted before any import that transitively loads them
// ---------------------------------------------------------------------------

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
    meals: {
      // Intentionally left empty explicitly, if needed
    },
    useUtils: vi.fn(),
  },
}));

// Next.js Link renders a plain <a> in jsdom (no router context needed)
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

vi.mock("~/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode; asChild?: boolean }) => children,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div role="menu">{children}</div>,
  DropdownMenuItem: ({
    children,
    onClick,
    className,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    className?: string;
  }) => (
    <button role="menuitem" onClick={onClick} className={className}>
      {children}
    </button>
  ),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/plan",
  useSearchParams: () => new URLSearchParams(),
}));

// Mock useMutationState
vi.mock("@tanstack/react-query", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@tanstack/react-query")>();
    return {
        ...actual,
        useMutationState: vi.fn().mockReturnValue([]),
    };
});

// ---------------------------------------------------------------------------
// Import the component AFTER the mocks are declared
// ---------------------------------------------------------------------------
import PlannerPage from "~/app/(protected)/plan/page";
import { api } from "~/trpc/react";

// ---------------------------------------------------------------------------
// Typed mock references
// ---------------------------------------------------------------------------
const mockUseQuery = api.plans.getActivePlan.useQuery as ReturnType<typeof vi.fn>;
const mockHistoryUseQuery = api.plans.getHistory.useQuery as ReturnType<typeof vi.fn>;
const mockHistoryPlanUseQuery = api.plans.getHistoryPlanById.useQuery as ReturnType<typeof vi.fn>;
const mockUseMutation = api.plan.generate.useMutation as ReturnType<typeof vi.fn>;
const mockUseUtils = api.useUtils as ReturnType<typeof vi.fn>;
const mockRegenerateFullMutation = api.plans.regenerateFull.useMutation as ReturnType<typeof vi.fn>;
const mockRegenerateDayMutation = api.plans.regenerateDay.useMutation as ReturnType<typeof vi.fn>;
const mockSwapMealMutation = api.plans.swapMeal.useMutation as ReturnType<typeof vi.fn>;
const mockRestorePlanMutation = api.plans.restorePlan.useMutation as ReturnType<typeof vi.fn>;
const mockGenerateListMutation = api.shoppingList.generateList.useMutation as ReturnType<typeof vi.fn>;
const mockShoppingGetListsQuery = api.shoppingList.getLists.useQuery as ReturnType<typeof vi.fn>;
const mockFeedbackGetForPlanQuery = api.feedback.getForPlan.useQuery as ReturnType<typeof vi.fn>;
const mockFeedbackRateMutation = api.feedback.rate.useMutation as ReturnType<typeof vi.fn>;

// ---------------------------------------------------------------------------
// Shared fixture helpers
// ---------------------------------------------------------------------------

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            retry: false,
        },
    },
});

const renderWithProvider = (ui: React.ReactElement) => {
    return render(
        <QueryClientProvider client={queryClient}>
            {ui}
        </QueryClientProvider>
    );
};

/** Minimal mutation stub – no pending requests, no errors. */
const idleMutation = {
  mutate: vi.fn(),
  isPending: false,
  isError: false,
};

/** Shared utils stub – required by the mutation's onSuccess handler. */
const utilsStub = {
  plans: { getActivePlan: { invalidate: vi.fn() } },
};

/**
 * Builds a minimal active-plan fixture.
 * @param startDateIso ISO string for the plan's start date (determines day columns).
 */
function buildActivePlan(startDateIso = "2026-01-01T00:00:00.000Z") {
  return {
    id: "plan-1",
    userId: "user-1",
    planDays: 2,
    isActive: true,
    startDate: startDateIso,
    createdAt: "2026-01-01T00:00:00.000Z",
    days: [
      {
        id: "day-1",
        planId: "plan-1",
        dayNumber: 1,
        meals: [
          {
            id: "meal-breakfast-1",
            dayId: "day-1",
            mealType: "breakfast" as const,
            recipeName: "Avocado Toast",
            imageUrl: null,
            ingredients: [],
            instructions: "Mash avocado on toast.",
            cookTimeMinutes: 10,
          },
          {
            id: "meal-lunch-1",
            dayId: "day-1",
            mealType: "lunch" as const,
            recipeName: "Caesar Salad",
            imageUrl: null,
            ingredients: [],
            instructions: "Toss ingredients.",
            cookTimeMinutes: 15,
          },
        ],
      },
      {
        id: "day-2",
        planId: "plan-1",
        dayNumber: 2,
        meals: [
          {
            id: "meal-dinner-2",
            dayId: "day-2",
            mealType: "dinner" as const,
            recipeName: "Spaghetti Bolognese",
            imageUrl: null,
            ingredients: [],
            instructions: "Cook pasta.",
            cookTimeMinutes: 30,
          },
        ],
      },
    ],
  };
}

function buildActivePlanWithLibraryImage(startDateIso = "2026-01-01T00:00:00.000Z") {
  const basePlan = buildActivePlan(startDateIso);

  return {
    ...basePlan,
    days: basePlan.days.map((day, dayIndex) => {
      if (dayIndex !== 0) {
        return day;
      }

      return {
        ...day,
        meals: day.meals.map((meal, mealIndex) => {
          if (mealIndex !== 0) {
            return meal;
          }

          return {
            ...meal,
            imageUrl: "https://images.example.com/meal-breakfast.jpg",
          };
        }),
      };
    }),
  };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  pushMock.mockReset();
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query === "(min-width: 768px)",
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
  mockUseUtils.mockReturnValue(utilsStub);
  mockHistoryUseQuery.mockReturnValue({ data: [], isLoading: false, refetch: vi.fn() });
  mockHistoryPlanUseQuery.mockReturnValue({ data: null, isLoading: false });
  mockUseMutation.mockReturnValue(idleMutation);
  mockRegenerateFullMutation.mockReturnValue(idleMutation);
  mockRegenerateDayMutation.mockReturnValue(idleMutation);
  mockSwapMealMutation.mockReturnValue(idleMutation);
  mockRestorePlanMutation.mockReturnValue(idleMutation);
  mockGenerateListMutation.mockReturnValue(idleMutation);
  mockShoppingGetListsQuery.mockReturnValue({ data: [], isLoading: false });
  mockFeedbackGetForPlanQuery.mockReturnValue({ data: {}, isLoading: false });
  mockFeedbackRateMutation.mockReturnValue(idleMutation);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("PlannerPage – empty state (no active plan)", () => {
  beforeEach(() => {
    mockUseQuery.mockReturnValue({ data: null, isLoading: false });
  });

  it("renders the 'Start Planning' heading", () => {
    renderWithProvider(<PlannerPage />);
    // CardTitle renders as a <div data-slot="card-title">, not an <h*> element,
    // so we match by visible text rather than role="heading".
    expect(screen.getByText(/start planning/i)).toBeInTheDocument();
  });

  it("shows the 'Generate Master Plan' call-to-action button", () => {
    renderWithProvider(<PlannerPage />);
    expect(
      screen.getByRole("button", { name: /generate master plan/i }),
    ).toBeInTheDocument();
  });

  it("does NOT render the Library section", () => {
    renderWithProvider(<PlannerPage />);
    expect(screen.queryByText(/library/i)).not.toBeInTheDocument();
  });
});

describe("PlannerPage – loading state", () => {
  it("renders a loading spinner (Loader2) and NO page content", () => {
    mockUseQuery.mockReturnValue({ data: undefined, isLoading: true });
    const { container } = renderWithProvider(<PlannerPage />);
    // The spinner is the only meaningful element when loading
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    // The container should contain an SVG (Loader2 icon)
    expect(container.querySelector("svg")).toBeInTheDocument();
  });
});

describe("PlannerPage – populated state (active plan)", () => {
  const getShoppingSplitDropdownTrigger = () => {
    const viewButton = screen.getByRole("button", { name: /view shopping list/i });
    const splitContainer = viewButton.parentElement;
    const buttons = splitContainer?.querySelectorAll("button");
    return buttons?.[1] ?? null;
  };

  beforeEach(() => {
    mockUseQuery.mockReturnValue({
      data: buildActivePlan(),
      isLoading: false,
    });
  });

  it("renders the 'Weekly Plan' main heading", () => {
    renderWithProvider(<PlannerPage />);
    expect(
      screen.getByRole("heading", { name: /weekly plan/i }),
    ).toBeInTheDocument();
  });

  it("renders the Library sidebar heading", () => {
    renderWithProvider(<PlannerPage />);
    expect(screen.getByText(/library/i)).toBeInTheDocument();
  });

  it("shows the total meal count in the library description", () => {
    renderWithProvider(<PlannerPage />);
    // 2 meals in day-1 + 1 meal in day-2 = 3
    // The new UI uses a Badge with "3 Meals". We use a more specific selector
    // to avoid matching the "3 Meals" option in the header select.
    const badge = screen.getAllByText(/3\s+meals/i).find(el => el.tagName === 'DIV');
    expect(badge).toBeInTheDocument();
  });

  it("renders meal names from the calendar matrix", () => {
    renderWithProvider(<PlannerPage />);
    expect(screen.getAllByText(/avocado toast/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/caesar salad/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/spaghetti bolognese/i).length).toBeGreaterThan(0);
  });

  it("does NOT show the empty-state 'Start Planning' heading", () => {
    renderWithProvider(<PlannerPage />);
    expect(
      screen.queryByText(/start planning/i),
    ).not.toBeInTheDocument();
  });

  it("opens the shopping scope selector when clicking Create Shopping List", () => {
    const mutate = vi.fn();
    mockGenerateListMutation.mockReturnValue({ mutate, isPending: false, isError: false });

    renderWithProvider(<PlannerPage />);

    const generateListBtn = screen.getByRole("button", { name: /create shopping list/i });
    fireEvent.click(generateListBtn);

    expect(screen.getByRole("heading", { name: /create shopping list/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /generate for all days/i })).toBeInTheDocument();
    expect(mutate).not.toHaveBeenCalled();
  });

  it("shows only Create Shopping List when there is no existing list for the active plan", () => {
    mockShoppingGetListsQuery.mockReturnValue({
      data: [
        {
          id: "other-plan-list",
          scope: "plan",
          scopeId: "plan-other",
          createdAt: "2026-01-02T00:00:00.000Z",
        },
      ],
      isLoading: false,
    });

    renderWithProvider(<PlannerPage />);

    expect(screen.getByRole("button", { name: /create shopping list/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /view shopping list/i })).not.toBeInTheDocument();
  });

  it("shows split button and dropdown trigger when plan-scoped lists already exist", () => {
    mockShoppingGetListsQuery.mockReturnValue({
      data: [
        {
          id: "plan-list-2",
          scope: "plan",
          scopeId: "plan-1",
          createdAt: "2026-01-03T00:00:00.000Z",
        },
      ],
      isLoading: false,
    });

    renderWithProvider(<PlannerPage />);

    expect(screen.getByRole("button", { name: /view shopping list/i })).toBeInTheDocument();
    expect(getShoppingSplitDropdownTrigger()).toBeInTheDocument();
  });

  it("routes to the latest list when clicking View Shopping List", () => {
    mockShoppingGetListsQuery.mockReturnValue({
      data: [
        {
          id: "older-list",
          scope: "plan",
          scopeId: "plan-1",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
        {
          id: "latest-list",
          scope: "plan",
          scopeId: "plan-1",
          createdAt: "2026-01-04T00:00:00.000Z",
        },
      ],
      isLoading: false,
    });

    renderWithProvider(<PlannerPage />);

    fireEvent.click(screen.getByRole("button", { name: /view shopping list/i }));

    expect(pushMock).toHaveBeenCalledWith("/shopping-list/latest-list");
  });

  it("shows both View Shopping List and Create New List options in dropdown", () => {
    mockShoppingGetListsQuery.mockReturnValue({
      data: [
        {
          id: "plan-list-2",
          scope: "plan",
          scopeId: "plan-1",
          createdAt: "2026-01-03T00:00:00.000Z",
        },
      ],
      isLoading: false,
    });

    renderWithProvider(<PlannerPage />);

    const dropdownTrigger = getShoppingSplitDropdownTrigger();
    expect(dropdownTrigger).toBeInTheDocument();
    fireEvent.click(dropdownTrigger!);

    expect(screen.getByRole("menuitem", { name: /view shopping list/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /create new list/i })).toBeInTheDocument();
  });

  it("shows warning toast and opens selector when clicking Create New List from dropdown", () => {
    const mutate = vi.fn();
    mockGenerateListMutation.mockReturnValue({ mutate, isPending: false, isError: false });
    mockShoppingGetListsQuery.mockReturnValue({
      data: [
        {
          id: "plan-list-2",
          scope: "plan",
          scopeId: "plan-1",
          createdAt: "2026-01-03T00:00:00.000Z",
        },
      ],
      isLoading: false,
    });

    renderWithProvider(<PlannerPage />);

    const dropdownTrigger = getShoppingSplitDropdownTrigger();
    expect(dropdownTrigger).toBeInTheDocument();
    fireEvent.click(dropdownTrigger!);
    fireEvent.click(screen.getByRole("menuitem", { name: /create new list/i }));

    expect(screen.getByText("Your existing list won't be deleted. Find all lists in Shopping Lists.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /create shopping list/i })).toBeInTheDocument();
    expect(mutate).not.toHaveBeenCalled();
  });

  it("only calls generateList mutation after scope selection from Create New List path", () => {
    const mutate = vi.fn();
    mockGenerateListMutation.mockReturnValue({ mutate, isPending: false, isError: false });
    mockShoppingGetListsQuery.mockReturnValue({
      data: [
        {
          id: "plan-list-2",
          scope: "plan",
          scopeId: "plan-1",
          createdAt: "2026-01-03T00:00:00.000Z",
        },
      ],
      isLoading: false,
    });

    renderWithProvider(<PlannerPage />);

    const dropdownTrigger = getShoppingSplitDropdownTrigger();
    expect(dropdownTrigger).toBeInTheDocument();
    fireEvent.click(dropdownTrigger!);
    fireEvent.click(screen.getByRole("menuitem", { name: /create new list/i }));

    expect(mutate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /generate for all days/i }));

    expect(mutate).toHaveBeenCalledOnce();
    expect(mutate).toHaveBeenCalledWith({
      scope: "plan",
      scopeId: "plan-1",
      dayIds: undefined,
    });
  });

  it("generates plan-scoped list for entire week when selecting 'Generate For All Days'", () => {
    const mutate = vi.fn();
    mockGenerateListMutation.mockReturnValue({ mutate, isPending: false, isError: false });

    renderWithProvider(<PlannerPage />);

    fireEvent.click(screen.getByRole("button", { name: /create shopping list/i }));
    fireEvent.click(screen.getByRole("button", { name: /generate for all days/i }));

    expect(mutate).toHaveBeenCalledOnce();
    expect(mutate).toHaveBeenCalledWith({
      scope: "plan",
      scopeId: "plan-1",
      dayIds: undefined,
    });
  });

  it("generates day-scoped list for a specific day with the correct dayId", () => {
    const mutate = vi.fn();
    mockGenerateListMutation.mockReturnValue({ mutate, isPending: false, isError: false });

    renderWithProvider(<PlannerPage />);

    fireEvent.click(screen.getByRole("button", { name: /create shopping list/i }));
    fireEvent.click(screen.getByRole("button", { name: /spaghetti bolognese/i }));

    expect(mutate).toHaveBeenCalledOnce();
    expect(mutate).toHaveBeenCalledWith({
      scope: "day",
      scopeId: "day-2",
      dayIds: undefined,
    });
  });

  it("generates plan-scoped list with selected dayIds when confirming multiple selected days", () => {
    const mutate = vi.fn();
    mockGenerateListMutation.mockReturnValue({ mutate, isPending: false, isError: false });

    renderWithProvider(<PlannerPage />);

    fireEvent.click(screen.getByRole("button", { name: /create shopping list/i }));
    fireEvent.click(screen.getByRole("button", { name: /select all/i }));
    fireEvent.click(screen.getByRole("button", { name: /generate for 2 selected days/i }));

    expect(mutate).toHaveBeenCalledOnce();
    expect(mutate).toHaveBeenCalledWith({
      scope: "plan",
      scopeId: "plan-1",
      dayIds: ["day-1", "day-2"],
    });
  });
});

describe("PlannerPage – meal card links", () => {
  beforeEach(() => {
    mockUseQuery.mockReturnValue({
      data: buildActivePlan(),
      isLoading: false,
    });
  });

  it("calendar meal cards link to /meals/[id]", () => {
    renderWithProvider(<PlannerPage />);
    // Each meal id appears as both calendar card + library entry → at least one per meal
    const breakfastLinks = screen
      .getAllByRole("link")
      .filter((a) => a.getAttribute("href") === "/meals/meal-breakfast-1");
    expect(breakfastLinks.length).toBeGreaterThanOrEqual(1);
  });

  it("library sidebar entries also link to /meals/[id]", () => {
    renderWithProvider(<PlannerPage />);
    const dinnerLinks = screen
      .getAllByRole("link")
      .filter((a) => a.getAttribute("href") === "/meals/meal-dinner-2");
    expect(dinnerLinks.length).toBeGreaterThanOrEqual(1);
  });

  it("every rendered link with an /meals/ prefix points to a valid meal id", () => {
    renderWithProvider(<PlannerPage />);
    const mealLinks = screen
      .getAllByRole("link")
      .filter((a) => a.getAttribute("href")?.startsWith("/meals/"));

    const validIds = new Set([
      "meal-breakfast-1",
      "meal-lunch-1",
      "meal-dinner-2",
    ]);

    for (const link of mealLinks) {
      const id = link.getAttribute("href")?.replace("/meals/", "");
      expect(validIds.has(id!)).toBe(true);
    }
  });
});

describe("PlannerPage – today highlight", () => {
  /**
   * Build a plan whose day-1 lands on a fixed reference date.
   * Using vi.useFakeTimers pins new Date() inside the component so the
   * test passes on any calendar date, not only on 2026-03-11.
   */
  const todayIso = "2026-03-11T00:00:00.000Z";

  beforeEach(() => {
    vi.useFakeTimers({ now: new Date(todayIso) });
    mockUseQuery.mockReturnValue({
      data: buildActivePlan(todayIso),
      isLoading: false,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("applies bg-primary/20 highlight class to today's day-header column", () => {
    const { container } = renderWithProvider(<PlannerPage />);
    // The highlighted header div carries bg-primary/20 and has px-1
    const highlightedHeader = container.querySelector("div.px-1[class*='bg-primary\\/20']");
    expect(highlightedHeader).not.toBeNull();
  });

  it("today's date number is rendered as white text", () => {
    const { container } = renderWithProvider(<PlannerPage />);
    // The date-number <span> carries text-xl + text-white.
    // The weekday <span> uses text-white too, so adding [class*='text-xl']
    // uniquely targets the date number element.
    const todaySpan = container.querySelector(
      "div.px-1[class*='bg-primary\\/20'] [class*='text-xl'][class*='text-white']",
    );
    expect(todaySpan).not.toBeNull();
    // The date number rendered is "11"
    expect(todaySpan?.textContent).toContain("11");
  });

  it("does NOT apply bg-primary/20 highlight to day columns in a plan that starts well in the past", () => {
    // Override with a past plan – no days land on 2026-03-11
    mockUseQuery.mockReturnValue({
      data: buildActivePlan("2025-01-01T00:00:00.000Z"),
      isLoading: false,
    });
    const { container } = renderWithProvider(<PlannerPage />);
    // Target the day columns specifically (which have px-1) to avoid matching the Schedule badge
    const highlightedHeader = container.querySelector("div.px-1[class*='bg-primary\\/20']");
    expect(highlightedHeader).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Feedback rating UI
// ---------------------------------------------------------------------------

describe("PlannerPage – feedback star rating UI", () => {
  beforeEach(() => {
    mockUseQuery.mockReturnValue({
      data: buildActivePlan(),
      isLoading: false,
    });
    mockFeedbackGetForPlanQuery.mockReturnValue({
      data: { "avocado toast": 4, "spaghetti bolognese": 0 },
      isLoading: false,
    });
  });

  it("renders 5 star buttons for each meal card using feedback map", () => {
    renderWithProvider(<PlannerPage />);
    const starButtons = screen.getAllByRole("button", {
      name: /^Rate .+ [1-5] stars$/i,
    });
    // Active plan mock has 3 meals (breakfast, lunch, dinner), 3 * 5 = 15 stars.
    expect(starButtons.length).toBe(15);
  });

  it("calls feedback.rate mutation when a star is clicked", () => {
    const mutateMock = vi.fn();
    mockFeedbackRateMutation.mockReturnValue({ mutate: mutateMock, isPending: false });

    renderWithProvider(<PlannerPage />);

    fireEvent.click(
      screen.getByRole("button", { name: "Rate Avocado Toast 5 stars" }),
    );

    expect(mutateMock).toHaveBeenCalledTimes(1);
    expect(mutateMock).toHaveBeenCalledWith(
      expect.objectContaining({ recipeName: "Avocado Toast", rating: 5 })
    );
  });

  it("renders star buttons for meals in the archived plan view", async () => {
    mockHistoryUseQuery.mockReturnValue({
      data: {
        plans: [
          {
            id: "history-1",
            createdAt: "2026-02-01T00:00:00.000Z",
            startDate: "2026-02-01T00:00:00.000Z",
            planDays: 1,
            mealCount: 1,
          },
        ],
        total: 1,
      },
      isFetching: false,
      refetch: vi.fn(),
    });
    mockHistoryPlanUseQuery.mockReturnValue({
      data: {
        id: "history-1",
        createdAt: "2026-02-01T00:00:00.000Z",
        startDate: "2026-02-01T00:00:00.000Z",
        planDays: 1,
        days: [
          {
            id: "history-day-1",
            dayNumber: 1,
            meals: [
              {
                id: "history-meal-1",
                mealType: "dinner",
                recipeName: "History Pasta",
                cookTimeMinutes: 25,
              },
            ],
          },
        ],
      },
      isLoading: false,
    });
    mockFeedbackGetForPlanQuery.mockReturnValue({
      data: {
        "avocado toast": 4,
        "spaghetti bolognese": 0,
        "history pasta": 3,
      },
      isLoading: false,
    });

    renderWithProvider(<PlannerPage />);

    fireEvent.click(await screen.findByRole("button", { name: /view/i }));

    expect(
      await screen.findByRole("button", { name: "Rate History Pasta 3 stars" }),
    ).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Refinement controls – Issue 18
// ---------------------------------------------------------------------------

describe("PlannerPage – refinement controls render in populated state", () => {
  beforeEach(() => {
    mockUseQuery.mockReturnValue({ data: buildActivePlan(), isLoading: false });
  });

  it("renders the 'Regenerate' button", () => {
    renderWithProvider(<PlannerPage />);
    // The main button's name is "RegenerateRegen" because of its two spans.
    // "Regenerate Day" buttons also match /regenerate/i, so we use a stricter match.
    expect(
      screen.getByRole("button", { name: /^Regenerate\s*Regen$/i }),
    ).toBeInTheDocument();
  });

  it("renders a 'Swap Meal' button for every occupied meal cell", () => {
    renderWithProvider(<PlannerPage />);
    // fixture: 3 occupied cells – breakfast/day-1, lunch/day-1, dinner/day-2
    const swapButtons = screen.getAllByTitle("Swap Meal");
    expect(swapButtons).toHaveLength(3);
  });

  it("renders a 'Regenerate Day' button for every day column", () => {
    renderWithProvider(<PlannerPage />);
    // fixture: 2 days
    const regenerateDayButtons = screen.getAllByTitle("Regenerate Day");
    expect(regenerateDayButtons).toHaveLength(2);
  });
});

describe("PlannerPage – Regenerate Full Plan confirmation path", () => {
  const regenerateFullMutate = vi.fn();

  beforeEach(() => {
    mockUseQuery.mockReturnValue({ data: buildActivePlan(), isLoading: false });
    mockRegenerateFullMutation.mockReturnValue({
      mutate: regenerateFullMutate,
      isPending: false,
      isError: false,
    });
  });

  it("calls regenerateFull.mutate() when the user confirms the dialog", () => {
    vi.spyOn(window, "confirm").mockReturnValueOnce(true);
    renderWithProvider(<PlannerPage />);
    fireEvent.click(screen.getByRole("button", { name: /^Regenerate\s*Regen$/i }));
    expect(regenerateFullMutate).toHaveBeenCalledOnce();
  });

  it("does NOT call regenerateFull.mutate() when the user cancels the dialog", () => {
    vi.spyOn(window, "confirm").mockReturnValueOnce(false);
    renderWithProvider(<PlannerPage />);
    fireEvent.click(screen.getByRole("button", { name: /^Regenerate\s*Regen$/i }));
    expect(regenerateFullMutate).not.toHaveBeenCalled();
  });

  it("renders regenerate override controls when an active plan exists", () => {
    renderWithProvider(<PlannerPage />);

    const controls = screen.getAllByRole("combobox");
    expect(controls).toHaveLength(2);
    expect(screen.getByRole("option", { name: /7 Days/i })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /3 Meals/i })).toBeInTheDocument();
  });

  it("passes selected regenerate overrides to mutate", () => {
    vi.spyOn(window, "confirm").mockReturnValueOnce(true);
    renderWithProvider(<PlannerPage />);

    const [daysSelect, mealsSelect] = screen.getAllByRole("combobox");
    fireEvent.change(daysSelect!, { target: { value: "6" } });
    fireEvent.change(mealsSelect!, { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: /^Regenerate\s*Regen$/i }));

    expect(regenerateFullMutate).toHaveBeenCalledWith({
      planDays: 6,
      mealsPerDay: 2,
    });
  });
});

describe("PlannerPage – regenerateDay mutation payload", () => {
  const regenerateDayMutate = vi.fn();

  beforeEach(() => {
    mockUseQuery.mockReturnValue({ data: buildActivePlan(), isLoading: false });
    mockRegenerateDayMutation.mockReturnValue({
      mutate: regenerateDayMutate,
      isPending: false,
      isError: false,
      variables: undefined,
    });
  });

  it("calls regenerateDay.mutate({ dayNumber: 1 }) when the day-1 header button is clicked", () => {
    renderWithProvider(<PlannerPage />);
    // getAllByTitle returns buttons in DOM order: day-1 first, day-2 second
    const [firstDayButton] = screen.getAllByTitle("Regenerate Day");
    fireEvent.click(firstDayButton!);
    expect(regenerateDayMutate).toHaveBeenCalledOnce();
    expect(regenerateDayMutate).toHaveBeenCalledWith({ dayNumber: 1 });
  });
});

describe("PlannerPage – swapMeal mutation payload", () => {
  const swapMealMutate = vi.fn();

  beforeEach(() => {
    mockUseQuery.mockReturnValue({ data: buildActivePlan(), isLoading: false });
    mockSwapMealMutation.mockReturnValue({
      mutate: swapMealMutate,
      isPending: false,
      isError: false,
      variables: undefined,
    });
  });

  it("calls swapMeal.mutate({ dayNumber: 1, mealType: 'breakfast' }) for the first occupied cell", () => {
    renderWithProvider(<PlannerPage />);
    // DOM order: breakfast row comes first; day-1 has Avocado Toast (occupied)
    const [firstSwapButton] = screen.getAllByTitle("Swap Meal");
    fireEvent.click(firstSwapButton!);
    expect(swapMealMutate).toHaveBeenCalledOnce();
    expect(swapMealMutate).toHaveBeenCalledWith({ dayNumber: 1, mealType: "breakfast" });
  });
});

describe("PlannerPage – meal image rendering", () => {
  beforeEach(() => {
    mockUseQuery.mockReturnValue({
      data: buildActivePlanWithLibraryImage(),
      isLoading: false,
    });
  });

  it("renders an <img> tag for meals with imageUrl in the calendar", () => {
    renderWithProvider(<PlannerPage />);

    const mealImages = screen.getAllByAltText("Avocado Toast");
    const calendarImage = mealImages.find(img => img.closest('div')?.classList.contains('absolute'));

    expect(calendarImage).toBeInTheDocument();
    expect(calendarImage).toHaveAttribute('src', 'https://images.example.com/meal-breakfast.jpg');
  });

  it("renders an <img> tag for meals with imageUrl in the library", () => {
    renderWithProvider(<PlannerPage />);

    const mealImages = screen.getAllByAltText("Avocado Toast");
    // The library image is inside a Link with class "block group"
    const libraryImage = mealImages.find(img => img.closest('a')?.classList.contains('group'));

    expect(libraryImage).toBeInTheDocument();
    expect(libraryImage).toHaveAttribute('src', 'https://images.example.com/meal-breakfast.jpg');
  });

  it("renders a gradient overlay alongside the meal image", () => {
    const { container } = renderWithProvider(<PlannerPage />);
    // Tailwind v4 may emit either bg-gradient-to-t or bg-linear-to-t.
    const overlay =
      container.querySelector(".bg-gradient-to-t") ??
      container.querySelector(".bg-linear-to-t");
    expect(overlay).toBeInTheDocument();
  });

  it("keeps meal text visible when image is present", () => {
    renderWithProvider(<PlannerPage />);
    expect(screen.getAllByText("Avocado Toast").length).toBeGreaterThan(0);
  });
});
