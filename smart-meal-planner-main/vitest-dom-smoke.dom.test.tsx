// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

describe("DOM harness smoke test", () => {
  it("renders a simple element in jsdom", () => {
    render(<p>dom-ok</p>);
    expect(screen.getByText("dom-ok")).toBeInTheDocument();
  });
});
