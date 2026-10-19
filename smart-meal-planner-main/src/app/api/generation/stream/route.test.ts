import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  auth: vi.fn(),
}));

const dbMocks = vi.hoisted(() => ({
  findFirstPlan: vi.fn(),
  findManyDays: vi.fn(),
}));

vi.mock("~/server/auth", () => ({
  auth: authMocks.auth,
}));

vi.mock("~/server/db", () => ({
  db: {
    query: {
      plans: {
        findFirst: dbMocks.findFirstPlan,
      },
      days: {
        findMany: dbMocks.findManyDays,
      },
    },
  },
}));

import { GET } from "./route";

function createRequest(url: string) {
  return new Request(url, { method: "GET" });
}

async function readStreamAsText(response: Response): Promise<string> {
  const decoder = new TextDecoder();
  const reader = response.body?.getReader();

  if (!reader) {
    return "";
  }

  let output = "";

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    output += decoder.decode(value, { stream: true });

    if (output.includes("event: generation_completed")) {
      break;
    }
  }

  output += decoder.decode();
  return output;
}

function extractEventNames(payload: string): string[] {
  return payload
    .split("\n")
    .filter((line) => line.startsWith("event: "))
    .map((line) => line.replace("event: ", ""));
}

describe("GET /api/generation/stream", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 401 when unauthenticated", async () => {
    authMocks.auth.mockResolvedValue(null);

    const response = await GET(
      createRequest("http://localhost/api/generation/stream?planId=plan-1"),
    );

    expect(response.status).toBe(401);
  });

  it("returns 403 for a plan owned by another user", async () => {
    authMocks.auth.mockResolvedValue({ user: { id: "user-1" } });
    dbMocks.findFirstPlan.mockResolvedValue({
      id: "plan-1",
      userId: "user-2",
      generationStatus: "in_progress",
    });

    const response = await GET(
      createRequest("http://localhost/api/generation/stream?planId=plan-1"),
    );

    expect(response.status).toBe(403);
  });

  it("returns 404 when the plan does not exist", async () => {
    authMocks.auth.mockResolvedValue({ user: { id: "user-1" } });
    dbMocks.findFirstPlan.mockResolvedValue(undefined);

    const response = await GET(
      createRequest("http://localhost/api/generation/stream?planId=missing-plan"),
    );

    expect(response.status).toBe(404);
  });

  it("streams persisted generation/day state transitions in order", async () => {
    vi.useFakeTimers();

    authMocks.auth.mockResolvedValue({ user: { id: "user-1" } });

    dbMocks.findFirstPlan
      .mockResolvedValueOnce({
        id: "plan-1",
        userId: "user-1",
        generationStatus: "in_progress",
      })
      .mockResolvedValueOnce({
        id: "plan-1",
        generationStatus: "in_progress",
      })
      .mockResolvedValueOnce({
        id: "plan-1",
        generationStatus: "in_progress",
      })
      .mockResolvedValueOnce({
        id: "plan-1",
        generationStatus: "in_progress",
      })
      .mockResolvedValueOnce({
        id: "plan-1",
        generationStatus: "partial_failure",
      });

    dbMocks.findManyDays
      .mockResolvedValueOnce([
        { id: "day-1", dayNumber: 1, status: "pending", failureReason: null },
        { id: "day-2", dayNumber: 2, status: "pending", failureReason: null },
      ])
      .mockResolvedValueOnce([
        { id: "day-1", dayNumber: 1, status: "generating", failureReason: null },
        { id: "day-2", dayNumber: 2, status: "pending", failureReason: null },
      ])
      .mockResolvedValueOnce([
        { id: "day-1", dayNumber: 1, status: "success", failureReason: null },
        { id: "day-2", dayNumber: 2, status: "generating", failureReason: null },
      ])
      .mockResolvedValueOnce([
        {
          id: "day-1",
          dayNumber: 1,
          status: "success",
          failureReason: null,
        },
        {
          id: "day-2",
          dayNumber: 2,
          status: "failed",
          failureReason: "provider_error",
        },
      ]);

    const response = await GET(
      createRequest("http://localhost/api/generation/stream?planId=plan-1"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");

    const outputPromise = readStreamAsText(response);

    await vi.advanceTimersByTimeAsync(1_600);

    const output = await outputPromise;
    const events = extractEventNames(output);

    expect(events).toEqual([
      "generation_started",
      "day_started",
      "day_saved",
      "day_started",
      "day_failed",
      "generation_completed",
    ]);

    expect(output).toContain('"completedDays":1');
    expect(output).toContain('"failedDays":1');
    expect(output).toContain('"status":"partial_failure"');
  });
});
