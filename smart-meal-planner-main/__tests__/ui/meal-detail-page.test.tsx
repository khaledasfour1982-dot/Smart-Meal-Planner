/**
 * @vitest-environment jsdom
 */

import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const navigationMocks = vi.hoisted(() => ({
    back: vi.fn(),
    useParams: vi.fn(() => ({ id: "meal-1" })),
}));

vi.mock("~/trpc/react", () => ({
    api: {
        meals: {
            getById: { useQuery: vi.fn() },
            getRecipeDetail: { useQuery: vi.fn() },
            estimatedCost: { useQuery: vi.fn() },
            simplifyRecipe: { useMutation: vi.fn() },
        },
        household: {
            get: { useQuery: vi.fn() },
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

vi.mock("next/navigation", () => ({
    useParams: navigationMocks.useParams,
    useRouter: () => ({ back: navigationMocks.back }),
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

import MealDetailPage from "~/app/meals/[id]/page";
import { api } from "~/trpc/react";
import { INSTRUCTIONS_PLACEHOLDER } from "~/server/ai/types";

const mockMealQuery = api.meals.getById.useQuery as ReturnType<typeof vi.fn>;
const mockRecipeDetailQuery = api.meals.getRecipeDetail.useQuery as ReturnType<typeof vi.fn>;
const mockHouseholdQuery = api.household.get.useQuery as ReturnType<typeof vi.fn>;
const mockFeedbackQuery = api.feedback.getForPlan.useQuery as ReturnType<typeof vi.fn>;
const mockRateMutation = api.feedback.rate.useMutation as ReturnType<typeof vi.fn>;
const mockSimplifyMutation = api.meals.simplifyRecipe.useMutation as ReturnType<typeof vi.fn>;
const mockGenerateListMutation = api.shoppingList.generateList.useMutation as ReturnType<typeof vi.fn>;
const mockGetListsQuery = api.shoppingList.getLists.useQuery as ReturnType<typeof vi.fn>;
const mockUseUtils = api.useUtils as ReturnType<typeof vi.fn>;

beforeEach(() => {
    vi.clearAllMocks();
    mockMealQuery.mockReturnValue({
        data: {
            id: "meal-1",
            recipeName: "Citrus Pasta",
            imageUrl: null,
            mealType: "dinner",
            cookTimeMinutes: 20,
            instructions: INSTRUCTIONS_PLACEHOLDER,
            ingredients: [
                {
                    name: "Pasta",
                    quantity: 200,
                    unit: "g",
                    category: "Pantry",
                    estPriceEuro: 1.5,
                },
            ],
        },
        isLoading: false,
        error: undefined,
    });
    mockRecipeDetailQuery.mockReturnValue({
        data: {
            mealId: "meal-1",
            recipeName: "Citrus Pasta",
            instructions: "1. Boil pasta gently. 2. Add citrus sauce.",
        },
        isLoading: false,
        error: undefined,
    });
    mockHouseholdQuery.mockReturnValue({
        data: { adults: 2, children: 0, toddlers: 0 },
        isLoading: false,
    });
    mockFeedbackQuery.mockReturnValue({
        data: { "citrus pasta": 3 },
        isLoading: false,
    });
    mockRateMutation.mockReturnValue({
        mutate: vi.fn(),
        isPending: false,
    });
    mockSimplifyMutation.mockReturnValue({
        mutate: vi.fn(),
        isPending: false,
    });
    mockGenerateListMutation.mockReturnValue({
        mutate: vi.fn(),
        isPending: false,
    });
    mockGetListsQuery.mockReturnValue({
        data: [],
        isLoading: false,
        error: undefined,
    });
    mockUseUtils.mockReturnValue({
        feedback: {
            getForPlan: {
                cancel: vi.fn(),
                getData: vi.fn(),
                setData: vi.fn(),
                invalidate: vi.fn(),
            },
        },
        meals: {
            getById: { invalidate: vi.fn() },
        },
        plans: {
            getActivePlan: { invalidate: vi.fn() },
        },
    });
});

describe("MealDetailPage", () => {
    it("queries lazy recipe details when the meal has placeholder instructions", () => {
        render(<MealDetailPage />);

        expect(mockRecipeDetailQuery).toHaveBeenCalledWith(
            { mealId: "meal-1" },
            { enabled: true },
        );
        expect(screen.getByText("Boil pasta gently")).toBeInTheDocument();
    });

    it("does not query lazy recipe details when the meal has actual instructions", () => {
        mockMealQuery.mockReturnValue({
            data: {
                id: "meal-1",
                recipeName: "Citrus Pasta",
                imageUrl: null,
                mealType: "dinner",
                cookTimeMinutes: 20,
                instructions: "1. Cook the pasta 2. Eat the pasta",
                ingredients: [],
            },
            isLoading: false,
            error: undefined,
        });

        render(<MealDetailPage />);

        expect(mockRecipeDetailQuery).toHaveBeenCalledWith(
            { mealId: "meal-1" },
            { enabled: false },
        );
        expect(screen.getByText("Cook the pasta")).toBeInTheDocument();
        expect(screen.getByText("Eat the pasta")).toBeInTheDocument();
    });

    it("renders the rating controls when the meal loads", () => {
        render(<MealDetailPage />);

        expect(
            screen.getByRole("button", { name: "Rate Citrus Pasta 3 stars" }),
        ).toBeInTheDocument();
        expect(mockFeedbackQuery).toHaveBeenCalledWith(
            { recipeNames: ["Citrus Pasta"] },
            { enabled: true },
        );
    });

    it("calls feedback.rate with the recipe name and selected rating", () => {
        const mutate = vi.fn();
        mockRateMutation.mockReturnValue({ mutate, isPending: false });

        render(<MealDetailPage />);

        fireEvent.click(
            screen.getByRole("button", { name: "Rate Citrus Pasta 5 stars" }),
        );

        expect(mutate).toHaveBeenCalledOnce();
        expect(mutate).toHaveBeenCalledWith({
            recipeName: "Citrus Pasta",
            rating: 5,
        });
    });

    it("calls generate list with the meal scope", () => {
        const mutate = vi.fn();
        mockGenerateListMutation.mockReturnValue({ mutate, isPending: false });

        render(<MealDetailPage />);

        fireEvent.click(
            screen.getByRole("button", { name: /add to shopping list/i }),
        );

        expect(mutate).toHaveBeenCalledOnce();
        expect(mutate).toHaveBeenCalledWith(expect.objectContaining({
            scope: "meal",
            scopeId: "meal-1",
            name: "Citrus Pasta List"
        }));
    });
});
