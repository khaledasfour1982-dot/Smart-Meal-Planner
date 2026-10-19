// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const authMocks = vi.hoisted(() => ({
  signOut: vi.fn(),
}));

vi.mock("~/trpc/react", () => ({
  api: {
    user: {
      getProfile: { useQuery: vi.fn() },
      updateProfile: { useMutation: vi.fn() },
      verifyCurrentPassword: { useMutation: vi.fn() },
      updatePassword: { useMutation: vi.fn() },
      deleteAccount: { useMutation: vi.fn() },
    },
    useUtils: vi.fn(),
  },
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

vi.mock("next-auth/react", () => ({
  signOut: authMocks.signOut,
}));

import ProfilePage from "~/app/(protected)/profile/page";
import { api } from "~/trpc/react";

const mockGetProfileQuery = api.user.getProfile.useQuery as ReturnType<typeof vi.fn>;
const mockUpdateProfileMutation = api.user.updateProfile.useMutation as ReturnType<typeof vi.fn>;
const mockVerifyPasswordMutation = api.user.verifyCurrentPassword.useMutation as ReturnType<typeof vi.fn>;
const mockUpdatePasswordMutation = api.user.updatePassword.useMutation as ReturnType<typeof vi.fn>;
const mockDeleteAccountMutation = api.user.deleteAccount.useMutation as ReturnType<typeof vi.fn>;
const mockUseUtils = api.useUtils as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockUseUtils.mockReturnValue({
    user: { getProfile: { invalidate: vi.fn() } },
  });
  mockGetProfileQuery.mockReturnValue({
    data: { name: "Test User", email: "test@example.com" },
    isLoading: false,
  });
  mockUpdateProfileMutation.mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
    isError: false,
  });
  mockVerifyPasswordMutation.mockReturnValue({
    mutateAsync: vi.fn(),
    isPending: false,
    isError: false,
  });
  mockUpdatePasswordMutation.mockReturnValue({
    mutateAsync: vi.fn(),
    isPending: false,
    isError: false,
  });
  mockDeleteAccountMutation.mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
    isError: false,
  });
});

describe("ProfilePage delete-account flow", () => {
  it("does not call the mutation when the confirm dialog is declined", () => {
    const mutate = vi.fn();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    mockDeleteAccountMutation.mockReturnValue({
      mutate,
      isPending: false,
      isError: false,
    });

    render(<ProfilePage />);
    fireEvent.click(screen.getByRole("button", { name: /delete account/i }));

    expect(confirmSpy).toHaveBeenCalledOnce();
    expect(mutate).not.toHaveBeenCalled();
    expect(authMocks.signOut).not.toHaveBeenCalled();
  });

  it("calls the mutation when the confirm dialog is accepted", () => {
    const mutate = vi.fn();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mockDeleteAccountMutation.mockReturnValue({
      mutate,
      isPending: false,
      isError: false,
    });

    render(<ProfilePage />);
    fireEvent.click(screen.getByRole("button", { name: /delete account/i }));

    expect(mutate).toHaveBeenCalledOnce();
  });

  it("signs the user out after a successful delete mutation", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mockDeleteAccountMutation.mockImplementation((options?: { onSuccess?: () => void }) => ({
      mutate: () => {
        options?.onSuccess?.();
      },
      isPending: false,
      isError: false,
    }));

    render(<ProfilePage />);
    fireEvent.click(screen.getByRole("button", { name: /delete account/i }));

    expect(authMocks.signOut).toHaveBeenCalledWith({ callbackUrl: "/login" });
  });
});