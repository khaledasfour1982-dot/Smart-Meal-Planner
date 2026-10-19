// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useGenerationStream } from "~/hooks/useGenerationStream";

type StreamListener = (event: { data: string }) => void;

class MockEventSource {
  static instances: MockEventSource[] = [];

  readonly url: string;
  readonly close = vi.fn();

  onopen: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  private readonly listeners = new Map<string, Set<StreamListener>>();

  constructor(url: string | URL) {
    this.url = String(url);
    MockEventSource.instances.push(this);
  }

  static reset() {
    MockEventSource.instances = [];
  }

  addEventListener(type: string, listener: StreamListener) {
    const listeners = this.listeners.get(type) ?? new Set<StreamListener>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: StreamListener) {
    this.listeners.get(type)?.delete(listener);
  }

  emitOpen() {
    this.onopen?.(new Event("open"));
  }

  emitError() {
    this.onerror?.(new Event("error"));
  }

  emit(type: string, payload?: unknown) {
    const event = {
      data: typeof payload === "string" ? payload : JSON.stringify(payload ?? {}),
    };

    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }
}

const originalEventSource = globalThis.EventSource;

describe("useGenerationStream", () => {
  beforeEach(() => {
    MockEventSource.reset();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    Object.defineProperty(globalThis, "EventSource", {
      configurable: true,
      writable: true,
      value: MockEventSource,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(globalThis, "EventSource", {
      configurable: true,
      writable: true,
      value: originalEventSource,
    });
  });

  it("connects to the generation stream when a planId exists", async () => {
    const { result } = renderHook(() => useGenerationStream("plan-123"));

    expect(MockEventSource.instances).toHaveLength(1);
    expect(MockEventSource.instances[0]?.url).toBe("/api/generation/stream?planId=plan-123");
    expect(result.current.connectionStatus).toBe("connecting");

    act(() => {
      MockEventSource.instances[0]?.emitOpen();
    });

    await waitFor(() => {
      expect(result.current.connectionStatus).toBe("connected");
    });
  });

  it("tracks day lifecycle events and derived counts through partial failure completion", async () => {
    const { result } = renderHook(() => useGenerationStream("plan-123"));
    const stream = MockEventSource.instances[0];

    act(() => {
      stream?.emitOpen();
      stream?.emit("generation_started");
      stream?.emit("day_started", { dayId: "day-1", dayNumber: 1 });
      stream?.emit("day_saved", { dayId: "day-1", dayNumber: 1 });
      stream?.emit("day_started", { dayId: "day-2", dayNumber: 2 });
      stream?.emit("day_failed", {
        dayId: "day-2",
        dayNumber: 2,
        failureReason: "Missing dinner candidates",
      });
      stream?.emit("generation_completed", {
        status: "partial_failure",
        completedDays: 1,
        failedDays: 1,
      });
    });

    await waitFor(() => {
      expect(result.current.connectionStatus).toBe("disconnected");
    });

    expect(result.current.isGenerating).toBe(false);
    expect(result.current.completedDays).toBe(1);
    expect(result.current.failedDays).toBe(1);
    expect(result.current.terminalStatus).toBe("partial_failure");
    expect(result.current.days[1]).toEqual({
      id: "day-1",
      dayNumber: 1,
      status: "success",
      failureReason: null,
    });
    expect(result.current.days[2]).toEqual({
      id: "day-2",
      dayNumber: 2,
      status: "failed",
      failureReason: "Missing dinner candidates",
    });
    expect(stream?.close).toHaveBeenCalledOnce();
  });

  it("stores retry message for day_allergen_retry and clears it on day_saved/day_failed for the same day", async () => {
    const { result } = renderHook(() => useGenerationStream("plan-retry"));
    const stream = MockEventSource.instances[0];

    act(() => {
      stream?.emit("day_allergen_retry", {
        dayId: "day-2",
        dayNumber: 2,
        message: "Retrying dinner due to allergen conflict.",
      });
    });

    await waitFor(() => {
      expect(result.current.retryMessages[2]).toBe("Retrying dinner due to allergen conflict.");
    });

    act(() => {
      stream?.emit("day_saved", { dayId: "day-2", dayNumber: 2 });
    });

    await waitFor(() => {
      expect(result.current.retryMessages[2]).toBeUndefined();
    });

    act(() => {
      stream?.emit("day_allergen_retry", {
        dayId: "day-2",
        dayNumber: 2,
        message: "Retrying lunch due to allergen conflict.",
      });
      stream?.emit("day_failed", {
        dayId: "day-2",
        dayNumber: 2,
        failureReason: "Could not recover allergen-safe meal.",
      });
    });

    await waitFor(() => {
      expect(result.current.retryMessages[2]).toBeUndefined();
    });
  });

  it("records successful completion state from the terminal event", async () => {
    const { result } = renderHook(() => useGenerationStream("plan-999"));
    const stream = MockEventSource.instances[0];

    act(() => {
      stream?.emit("generation_started");
      stream?.emit("day_saved", { dayId: "day-1", dayNumber: 1 });
      stream?.emit("generation_completed", {
        status: "completed",
        completedDays: 1,
        failedDays: 0,
      });
    });

    await waitFor(() => {
      expect(result.current.terminalStatus).toBe("completed");
    });

    expect(result.current.completedDays).toBe(1);
    expect(result.current.failedDays).toBe(0);
    expect(result.current.days[1]?.status).toBe("success");
  });

  it("closes the EventSource on plan change and unmount", () => {
    const { rerender, unmount, result } = renderHook(
      ({ planId }) => useGenerationStream(planId),
      { initialProps: { planId: "plan-123" as string | null } },
    );

    const firstStream = MockEventSource.instances[0];
    expect(firstStream).toBeDefined();

    rerender({ planId: "plan-456" });

    const secondStream = MockEventSource.instances[1];
    expect(firstStream?.close).toHaveBeenCalledOnce();
    expect(secondStream?.url).toBe("/api/generation/stream?planId=plan-456");

    rerender({ planId: null });

    expect(secondStream?.close).toHaveBeenCalledOnce();
    expect(result.current.connectionStatus).toBe("disconnected");
    expect(result.current.days).toEqual({});

    unmount();
  });

  it("surfaces a reconnecting state on connection error without force-closing", async () => {
    const { result } = renderHook(() => useGenerationStream("plan-error"));
    const stream = MockEventSource.instances[0];

    act(() => {
      stream?.emitError();
    });

    await waitFor(() => {
      expect(result.current.connectionStatus).toBe("connecting");
    });

    expect(result.current.error).toBe("Connection interrupted. Reconnecting...");
    expect(stream?.close).not.toHaveBeenCalled();
  });
});