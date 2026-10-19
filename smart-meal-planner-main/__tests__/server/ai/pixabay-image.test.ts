import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const originalFetch = globalThis.fetch;

async function loadSubject() {
  const module = await import("~/server/ai/pixabay-image");
  return module.fetchPixabayImage;
}

describe("fetchPixabayImage", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doMock("~/env.js", () => ({
      env: {
        PIXABAY_API_KEY: "pixabay-test-key",
      },
    }));
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns the first hit webformatURL when Pixabay responds with hits", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        hits: [
          {
            webformatURL: "https://cdn.example.com/food-1.jpg",
          },
          {
            webformatURL: "https://cdn.example.com/food-2.jpg",
          },
        ],
      }),
    });
    globalThis.fetch = fetchMock as typeof globalThis.fetch;

    const fetchPixabayImage = await loadSubject();
    const result = await fetchPixabayImage("Vegetable Pasta");

    expect(result).toBe("https://cdn.example.com/food-1.jpg");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("returns null when Pixabay response has empty hits", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        hits: [],
      }),
    });
    globalThis.fetch = fetchMock as typeof globalThis.fetch;

    const fetchPixabayImage = await loadSubject();
    const result = await fetchPixabayImage("Vegetable Pasta");

    expect(result).toBeNull();
  });

  it("returns null when Pixabay responds with non-ok status", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: vi.fn(),
    });
    globalThis.fetch = fetchMock as typeof globalThis.fetch;

    const fetchPixabayImage = await loadSubject();
    const result = await fetchPixabayImage("Vegetable Pasta");

    expect(result).toBeNull();
  });

  it("returns null when fetch throws", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network error"));
    globalThis.fetch = fetchMock as typeof globalThis.fetch;

    const fetchPixabayImage = await loadSubject();
    const result = await fetchPixabayImage("Vegetable Pasta");

    expect(result).toBeNull();
  });
});