import { useEffect, useState, useCallback } from "react";

export type DayStatus = "pending" | "generating" | "success" | "failed";

export interface DayState {
  id?: string;
  dayNumber: number;
  status: DayStatus;
  failureReason: string | null;
}

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

export interface UseGenerationStreamReturn {
  connectionStatus: ConnectionStatus;
  isGenerating: boolean;
  days: Record<number, DayState>;
  retryMessages: Record<number, string>;
  completedDays: number;
  failedDays: number;
  terminalStatus: "completed" | "partial_failure" | null;
  error: string | null;
  reset: () => void;
}

export function useGenerationStream(planId: string | null): UseGenerationStreamReturn {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("disconnected");
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [days, setDays] = useState<Record<number, DayState>>({});
  const [retryMessages, setRetryMessages] = useState<Record<number, string>>({});
  const [terminalStatus, setTerminalStatus] = useState<"completed" | "partial_failure" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const completedDays = Object.values(days).filter((d) => d.status === "success").length;
  const failedDays = Object.values(days).filter((d) => d.status === "failed").length;

  const reset = useCallback(() => {
    setConnectionStatus("disconnected");
    setIsGenerating(false);
    setDays({});
    setRetryMessages({});
    setTerminalStatus(null);
    setError(null);
  }, []);

  useEffect(() => {
    if (!planId) {
      reset();
      return;
    }

    setConnectionStatus("connecting");
    setError(null);

    const eventSource = new EventSource(`/api/generation/stream?planId=${planId}`);

    eventSource.onopen = () => {
      setConnectionStatus("connected");
      setError(null);
    };

    eventSource.onerror = (err) => {
      // EventSource automatically reconnects; we log a warning as it's often a routine timeout or transient issue.
      console.warn("SSE stream connection interrupted. Reconnecting...", err);
      setConnectionStatus("connecting");
      setError("Connection interrupted. Reconnecting...");
    };

    eventSource.addEventListener("generation_started", () => {
      setIsGenerating(true);
      setTerminalStatus(null);
    });

    eventSource.addEventListener("day_started", (e) => {
      const data = JSON.parse((e as MessageEvent).data);
      const dayNumber = data.dayNumber as number;
      setDays((prev) => ({
        ...prev,
        [dayNumber]: {
          id: data.dayId,
          dayNumber,
          status: "generating",
          failureReason: null,
        },
      }));
    });

    eventSource.addEventListener("day_saved", (e) => {
      const data = JSON.parse((e as MessageEvent).data);
      const dayNumber = data.dayNumber as number;
      setDays((prev) => ({
        ...prev,
        [dayNumber]: {
          id: data.dayId,
          dayNumber,
          status: "success",
          failureReason: null,
        },
      }));
      setRetryMessages((prev) => {
        const next = { ...prev };
        delete next[dayNumber];
        return next;
      });
    });

    eventSource.addEventListener("day_failed", (e) => {
      const data = JSON.parse((e as MessageEvent).data);
      const dayNumber = data.dayNumber as number;
      setDays((prev) => ({
        ...prev,
        [dayNumber]: {
          id: data.dayId,
          dayNumber,
          status: "failed",
          failureReason: data.failureReason,
        },
      }));
      setRetryMessages((prev) => {
        const next = { ...prev };
        delete next[dayNumber];
        return next;
      });
    });

    eventSource.addEventListener("day_allergen_retry", (e) => {
      const data = JSON.parse((e as MessageEvent).data);
      const dayNumber = data.dayNumber as number;
      const message = data.message as string;
      setRetryMessages((prev) => ({
        ...prev,
        [dayNumber]: message,
      }));
    });

    eventSource.addEventListener("generation_completed", (e) => {
      const data = JSON.parse((e as MessageEvent).data);
      setTerminalStatus(data.status as "completed" | "partial_failure");
      setIsGenerating(false);
      
      eventSource.close();
      setConnectionStatus("disconnected");
    });

    return () => {
      eventSource.close();
    };
  }, [planId, reset]);

  return {
    connectionStatus,
    isGenerating,
    days,
    retryMessages,
    completedDays,
    failedDays,
    terminalStatus,
    error,
    reset,
  };
}
