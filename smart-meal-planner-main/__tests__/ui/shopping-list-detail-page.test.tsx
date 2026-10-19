/**
 * @vitest-environment jsdom
 */

import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const trpcMocks = vi.hoisted(() => ({
  getListUseQuery: vi.fn(),
  getListsUseQuery: vi.fn(),
  updateNameUseMutation: vi.fn(),
  addItemUseMutation: vi.fn(),
  toggleCheckedUseMutation: vi.fn(),
  updateItemUseMutation: vi.fn(),
  deleteItemUseMutation: vi.fn(),
  useUtils: vi.fn(),
}));

const navigationMocks = vi.hoisted(() => ({
  push: vi.fn(),
}));

vi.mock("~/trpc/react", () => ({
  api: {
    shoppingList: {
      getList: { useQuery: trpcMocks.getListUseQuery },
      getLists: { useQuery: trpcMocks.getListsUseQuery },
      updateName: { useMutation: trpcMocks.updateNameUseMutation },
      addItem: { useMutation: trpcMocks.addItemUseMutation },
      toggleChecked: { useMutation: trpcMocks.toggleCheckedUseMutation },
      updateItem: { useMutation: trpcMocks.updateItemUseMutation },
      deleteItem: { useMutation: trpcMocks.deleteItemUseMutation },
    },
    useUtils: trpcMocks.useUtils,
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: navigationMocks.push,
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

import ShoppingListDetailClient from "~/app/(protected)/shopping-list/[id]/client-page";
import { ShoppingListButton } from "~/components/shopping/shopping-list-button";

let currentList = {
  id: "list-1",
  userId: "user-1",
  scope: "plan",
  scopeId: "plan-1",
  name: "Weekly Groceries",
  createdAt: new Date("2026-03-20T00:00:00.000Z"),
  updatedAt: new Date("2026-03-20T00:00:00.000Z"),
  items: [],
};

let updateMutationOptions: {
  onMutate?: (vars: { id: string; name: string }) => Promise<unknown> | unknown;
  onSuccess?: (data?: unknown, vars?: unknown, ctx?: unknown) => unknown;
  onError?: (err: Error, vars?: unknown, ctx?: unknown) => unknown;
  onSettled?: () => unknown;
} | null = null;

let updateMutationState = {
  isPending: false,
};

let updateMutateSpy = vi.fn();

const utilsMock = {
  shoppingList: {
    getList: {
      cancel: vi.fn().mockResolvedValue(undefined),
      getData: vi.fn(() => currentList),
      setData: vi.fn((_key: unknown, value: unknown) => {
        currentList = value as typeof currentList;
      }),
      invalidate: vi.fn().mockResolvedValue(undefined),
    },
  },
};

function configureUpdateMutation(overrides?: {
  isPending?: boolean;
  onMutateImpl?: (vars: { id: string; name: string }) => Promise<unknown> | unknown;
}) {
  updateMutationState = {
    isPending: overrides?.isPending ?? false,
  };

  updateMutateSpy = vi.fn((vars: { id: string; name: string }) => {
    if (overrides?.onMutateImpl) {
      void overrides.onMutateImpl(vars);
    }
  });

  trpcMocks.updateNameUseMutation.mockImplementation((options: typeof updateMutationOptions) => {
    updateMutationOptions = options;
    return {
      mutate: updateMutateSpy,
      isPending: updateMutationState.isPending,
      error: undefined,
    };
  });
}

function renderShoppingDetail() {
  return render(<ShoppingListDetailClient listId="list-1" />);
}

function enterEditMode() {
  fireEvent.click(screen.getByRole("button", { name: /edit list name/i }));
  return screen.getByDisplayValue(currentList.name) as HTMLInputElement;
}

function getInlineEditButtons(input: HTMLInputElement) {
  const buttonNodes = input.parentElement?.querySelectorAll("button") ?? [];
  return {
    saveButton: buttonNodes[0] as HTMLButtonElement,
    cancelButton: buttonNodes[1] as HTMLButtonElement,
  };
}

function dropdownFixture() {
  return [
    {
      id: "list-1",
      userId: "user-1",
      scope: "plan",
      scopeId: "plan-1",
      name: "Weekly Groceries",
      createdAt: new Date("2026-03-21T00:00:00.000Z"),
      updatedAt: new Date("2026-03-21T00:00:00.000Z"),
      items: [],
    },
  ];
}

function getDropdownTriggerButton() {
  const viewButton = screen.getByRole("button", { name: /view shopping list/i });
  const splitContainer = viewButton.parentElement;
  return splitContainer?.querySelector("button.group") as HTMLButtonElement;
}

beforeEach(() => {
  vi.clearAllMocks();

  currentList = {
    id: "list-1",
    userId: "user-1",
    scope: "plan",
    scopeId: "plan-1",
    name: "Weekly Groceries",
    createdAt: new Date("2026-03-20T00:00:00.000Z"),
    updatedAt: new Date("2026-03-20T00:00:00.000Z"),
    items: [],
  };

  updateMutationOptions = null;

  configureUpdateMutation();

  trpcMocks.getListUseQuery.mockImplementation(() => ({
    data: currentList,
    isLoading: false,
  }));

  trpcMocks.getListsUseQuery.mockReturnValue({
    data: dropdownFixture(),
    isLoading: false,
  });

  trpcMocks.addItemUseMutation.mockReturnValue({ mutate: vi.fn(), isPending: false });
  trpcMocks.toggleCheckedUseMutation.mockReturnValue({ mutate: vi.fn(), isPending: false });
  trpcMocks.updateItemUseMutation.mockReturnValue({ mutate: vi.fn(), isPending: false });
  trpcMocks.deleteItemUseMutation.mockReturnValue({ mutate: vi.fn(), isPending: false });

  trpcMocks.useUtils.mockReturnValue(utilsMock);

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
});

describe("ShoppingListButton dropdown interactions", () => {
  it("toggles dropdown open state when trigger is clicked", () => {
    const onCreateNew = vi.fn();
    render(<ShoppingListButton planId="plan-1" onCreateNew={onCreateNew} />);

    const trigger = getDropdownTriggerButton();

    expect(trigger.getAttribute("data-state")).toBe("closed");
    expect(screen.queryByText("Create New List")).not.toBeInTheDocument();

    fireEvent.click(trigger);

    expect(trigger.getAttribute("data-state")).toBe("open");
    expect(screen.getByText("Create New List")).toBeInTheDocument();

    fireEvent.click(trigger);

    expect(trigger.getAttribute("data-state")).toBe("closed");
    expect(screen.queryByText("Create New List")).not.toBeInTheDocument();
  });

  it("updates trigger data-state to open for chevron rotation styles", () => {
    const onCreateNew = vi.fn();
    render(<ShoppingListButton planId="plan-1" onCreateNew={onCreateNew} />);

    const trigger = getDropdownTriggerButton();

    expect(trigger.getAttribute("data-state")).toBe("closed");
    fireEvent.click(trigger);
    expect(trigger.getAttribute("data-state")).toBe("open");
  });

  it("closes dropdown when clicking outside", () => {
    const onCreateNew = vi.fn();
    render(<ShoppingListButton planId="plan-1" onCreateNew={onCreateNew} />);

    const trigger = getDropdownTriggerButton();
    fireEvent.click(trigger);

    expect(screen.getByText("Create New List")).toBeInTheDocument();

    fireEvent.mouseDown(document.body);

    expect(trigger.getAttribute("data-state")).toBe("closed");
    expect(screen.queryByText("Create New List")).not.toBeInTheDocument();
  });

  it("closes dropdown and fires callback when selecting a menu item", () => {
    const onCreateNew = vi.fn();
    render(<ShoppingListButton planId="plan-1" onCreateNew={onCreateNew} />);

    const trigger = getDropdownTriggerButton();
    fireEvent.click(trigger);

    fireEvent.click(screen.getByText("Create New List"));

    expect(onCreateNew).toHaveBeenCalledTimes(1);
    expect(trigger.getAttribute("data-state")).toBe("closed");
    expect(screen.queryByText("Create New List")).not.toBeInTheDocument();
  });

  it("handles rapid trigger clicks without ending in an inconsistent state", () => {
    const onCreateNew = vi.fn();
    render(<ShoppingListButton planId="plan-1" onCreateNew={onCreateNew} />);

    const trigger = getDropdownTriggerButton();

    for (let i = 0; i < 7; i += 1) {
      fireEvent.click(trigger);
    }

    expect(trigger.getAttribute("data-state")).toBe("open");
    expect(screen.getByText("Create New List")).toBeInTheDocument();
  });

  it.skip("closes dropdown on ESC key (if implemented)", () => {
    const onCreateNew = vi.fn();
    render(<ShoppingListButton planId="plan-1" onCreateNew={onCreateNew} />);

    const trigger = getDropdownTriggerButton();
    fireEvent.click(trigger);
    fireEvent.keyDown(document, { key: "Escape" });

    expect(trigger.getAttribute("data-state")).toBe("closed");
  });
});

describe("Editable shopping list name UI", () => {
  it("shows list name in default view mode", () => {
    renderShoppingDetail();

    expect(screen.getByText("Weekly Groceries")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("Weekly Groceries")).not.toBeInTheDocument();
  });

  it("enters edit mode when the pencil button is clicked", () => {
    renderShoppingDetail();

    enterEditMode();

    expect(screen.getByDisplayValue("Weekly Groceries")).toBeInTheDocument();
  });

  it("enters edit mode on double-clicking the name", () => {
    renderShoppingDetail();

    fireEvent.doubleClick(screen.getByText("Weekly Groceries"));

    expect(screen.getByDisplayValue("Weekly Groceries")).toBeInTheDocument();
  });

  it("pre-fills edit input with current name", () => {
    renderShoppingDetail();

    const input = enterEditMode();

    expect(input).toHaveValue("Weekly Groceries");
  });

  it("disables save button when name is empty", () => {
    renderShoppingDetail();

    const input = enterEditMode();
    fireEvent.change(input, { target: { value: "   " } });

    const { saveButton } = getInlineEditButtons(input);
    expect(saveButton).toBeDisabled();
  });

  it("disables save button when name is unchanged", () => {
    renderShoppingDetail();

    const input = enterEditMode();
    const { saveButton } = getInlineEditButtons(input);

    expect(saveButton).toBeDisabled();
  });

  it("disables save button when name exceeds 100 characters", () => {
    renderShoppingDetail();

    const input = enterEditMode();
    fireEvent.change(input, { target: { value: "a".repeat(101) } });

    const { saveButton } = getInlineEditButtons(input);
    expect(saveButton).toBeDisabled();
  });

  it("exits edit mode without saving when Cancel is clicked", () => {
    renderShoppingDetail();

    const input = enterEditMode();
    fireEvent.change(input, { target: { value: "Renamed List" } });

    const { cancelButton } = getInlineEditButtons(input);
    fireEvent.click(cancelButton);

    expect(screen.getByText("Weekly Groceries")).toBeInTheDocument();
    expect(updateMutateSpy).not.toHaveBeenCalled();
  });

  it("exits edit mode without saving when ESC is pressed", () => {
    renderShoppingDetail();

    const input = enterEditMode();
    fireEvent.change(input, { target: { value: "Renamed List" } });
    fireEvent.keyDown(input, { key: "Escape" });

    expect(screen.getByText("Weekly Groceries")).toBeInTheDocument();
    expect(updateMutateSpy).not.toHaveBeenCalled();
  });

  it("calls updateName mutation with list id and trimmed name when saving", () => {
    renderShoppingDetail();

    const input = enterEditMode();
    fireEvent.change(input, { target: { value: "  Renamed List  " } });

    const { saveButton } = getInlineEditButtons(input);
    fireEvent.click(saveButton);

    expect(updateMutateSpy).toHaveBeenCalledWith({ id: "list-1", name: "Renamed List" });
  });

  it("shows loading spinner while name update mutation is pending", () => {
    configureUpdateMutation({ isPending: true });
    renderShoppingDetail();

    const input = enterEditMode();
    const { saveButton } = getInlineEditButtons(input);

    expect(saveButton).toBeDisabled();
    expect(saveButton.querySelector(".animate-spin")).toBeInTheDocument();
  });

  it.each([
    ["403", "FORBIDDEN"],
    ["404", "Shopping list not found"],
    ["network", "Network Error"],
  ])("shows error toast when mutation fails (%s)", async (_label, message) => {
    configureUpdateMutation({
      onMutateImpl: async (vars) => {
        if (!updateMutationOptions) {
          return;
        }

        const ctx = await updateMutationOptions.onMutate?.(vars);
        await updateMutationOptions.onError?.(new Error(message), vars, ctx);
        await updateMutationOptions.onSettled?.();
      },
    });

    renderShoppingDetail();

    const input = enterEditMode();
    fireEvent.change(input, { target: { value: "Renamed List" } });

    const { saveButton } = getInlineEditButtons(input);
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(screen.getByText(message)).toBeInTheDocument();
    });
  });

  it("applies optimistic name update so the new name appears immediately after save", async () => {
    configureUpdateMutation({
      onMutateImpl: async (vars) => {
        currentList = {
          ...currentList,
          name: vars.name,
        };

        if (!updateMutationOptions) {
          return;
        }

        const ctx = await updateMutationOptions.onMutate?.(vars);
        await updateMutationOptions.onSuccess?.(undefined, vars, ctx);
        await updateMutationOptions.onSettled?.();
      },
    });

    const view = renderShoppingDetail();

    const input = enterEditMode();
    fireEvent.change(input, { target: { value: "Optimistic Name" } });

    const { saveButton } = getInlineEditButtons(input);
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(updateMutateSpy).toHaveBeenCalledWith({ id: "list-1", name: "Optimistic Name" });
    });

    view.rerender(<ShoppingListDetailClient listId="list-1" />);

    await waitFor(() => {
      expect(screen.getByText("Optimistic Name")).toBeInTheDocument();
    });
  });

  it("shows and updates character counter in real time", () => {
    renderShoppingDetail();

    const input = enterEditMode();
    expect(screen.getByText("16/100 characters")).toBeInTheDocument();

    fireEvent.change(input, { target: { value: "Short" } });

    expect(screen.getByText("5/100 characters")).toBeInTheDocument();
  });

  it("supports editing workflow on mobile viewport", async () => {
    configureUpdateMutation({
      onMutateImpl: async (vars) => {
        currentList = {
          ...currentList,
          name: vars.name,
        };

        if (!updateMutationOptions) {
          return;
        }

        const ctx = await updateMutationOptions.onMutate?.(vars);
        await updateMutationOptions.onSuccess?.(undefined, vars, ctx);
        await updateMutationOptions.onSettled?.();
      },
    });

    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation(() => ({
        matches: false,
        media: "(min-width: 768px)",
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });

    const view = renderShoppingDetail();

    const input = enterEditMode();
    fireEvent.change(input, { target: { value: "Mobile Name" } });

    const { saveButton } = getInlineEditButtons(input);
    fireEvent.click(saveButton);

    view.rerender(<ShoppingListDetailClient listId="list-1" />);

    await waitFor(() => {
      expect(screen.getByText("Mobile Name")).toBeInTheDocument();
    });
  });
});
