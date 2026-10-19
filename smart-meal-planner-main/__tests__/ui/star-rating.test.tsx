// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { StarRating } from "~/components/meal/StarRating";

describe("StarRating", () => {
  it("renders five recipe-specific star buttons", () => {
    render(
      <StarRating
        recipeName="Tomato Soup"
        currentRating={3}
        onRate={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Rate Tomato Soup 1 stars" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Rate Tomato Soup 5 stars" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(5);
  });

  it("calls onRate with the selected value", () => {
    const onRate = vi.fn();

    render(
      <StarRating recipeName="Tomato Soup" currentRating={0} onRate={onRate} />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Rate Tomato Soup 4 stars" }),
    );

    expect(onRate).toHaveBeenCalledOnce();
    expect(onRate).toHaveBeenCalledWith(4);
  });

  it("does not call onRate when disabled", () => {
    const onRate = vi.fn();

    render(
      <StarRating
        recipeName="Tomato Soup"
        currentRating={0}
        onRate={onRate}
        disabled
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Rate Tomato Soup 2 stars" }),
    );

    expect(onRate).not.toHaveBeenCalled();
  });
});
