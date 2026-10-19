/**
 * Uses adaptive DB polling backoff for SSE progress streaming while
 * preserving per-slot allergen retry UX events.
 */
import { eq } from "drizzle-orm";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { days, plans } from "~/server/db/schema";

const POLL_INTERVAL_INITIAL_MS = 300;
const POLL_INTERVAL_AFTER_ONE_SAVED_MS = 600;
const POLL_INTERVAL_AFTER_THREE_SAVED_MS = 1000;
const STREAM_TIMEOUT_MS = 600_000;
const HEARTBEAT_INTERVAL_MS = 15_000;
const ENABLE_POLL_DEBUG =
  process.env.NODE_ENV !== "production" && process.env.SSE_POLL_DEBUG === "1";

const terminalStatuses = new Set(["completed", "partial_failure"]);

type DayRecord = {
  id: string;
  dayNumber: number;
  status: string;
  failureReason: string | null;
};

function getPollIntervalMs(savedDayCount: number): number {
  if (savedDayCount >= 3) {
    return POLL_INTERVAL_AFTER_THREE_SAVED_MS;
  }

  if (savedDayCount >= 1) {
    return POLL_INTERVAL_AFTER_ONE_SAVED_MS;
  }

  return POLL_INTERVAL_INITIAL_MS;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createSseHeaders(): HeadersInit {
  return {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  };
}

function writeSseEvent(
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  event: string,
  data: Record<string, unknown>,
): void {
  controller.enqueue(
    encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
  );
}

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const session = await auth();

  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const planId = searchParams.get("planId")?.trim();

  if (!planId) {
    return new Response("Missing planId", { status: 400 });
  }

  const plan = await db.query.plans.findFirst({
    where: eq(plans.id, planId),
    columns: {
      id: true,
      userId: true,
      generationStatus: true,
    },
  });

  if (!plan) {
    return new Response("Not found", { status: 404 });
  }

  if (plan.userId !== session.user.id) {
    return new Response("Forbidden", { status: 403 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      let lastPlanStatus: string | undefined;
      const lastDayState = new Map<string, { status: string; failureReason: string | null }>();

      const timeoutTimer = setTimeout(() => {
        close();
      }, STREAM_TIMEOUT_MS);

      // Keep the SSE channel active through intermediaries during long model calls.
      const heartbeatTimer = setInterval(() => {
        if (closed) {
          return;
        }

        writeSseEvent(controller, encoder, "heartbeat", {
          ts: Date.now(),
        });
      }, HEARTBEAT_INTERVAL_MS);

      const close = () => {
        if (closed) {
          return;
        }

        closed = true;
        clearInterval(heartbeatTimer);
        clearTimeout(timeoutTimer);

        controller.close();
      };

      const pollState = async (): Promise<{ shouldClose: boolean; savedDayCount: number }> => {
        if (closed) {
          return { shouldClose: true, savedDayCount: 0 };
        }

        const currentPlan = await db.query.plans.findFirst({
          where: eq(plans.id, planId),
          columns: {
            id: true,
            generationStatus: true,
          },
        });

        if (!currentPlan) {
          close();
          return { shouldClose: true, savedDayCount: 0 };
        }

        if (
          lastPlanStatus === undefined &&
          (currentPlan.generationStatus === "in_progress" ||
            terminalStatuses.has(currentPlan.generationStatus))
        ) {
          writeSseEvent(controller, encoder, "generation_started", {
            planId,
            status: currentPlan.generationStatus,
          });
        }

        if (
          lastPlanStatus !== undefined &&
          lastPlanStatus !== "in_progress" &&
          currentPlan.generationStatus === "in_progress"
        ) {
          writeSseEvent(controller, encoder, "generation_started", {
            planId,
            status: currentPlan.generationStatus,
          });
        }

        const currentDays = await db.query.days.findMany({
          where: eq(days.planId, planId),
          columns: {
            id: true,
            dayNumber: true,
            status: true,
            failureReason: true,
          },
          orderBy: (table, { asc }) => [asc(table.dayNumber)],
        });

        for (const day of currentDays as DayRecord[]) {
          const previous = lastDayState.get(day.id);

          if (previous?.status === day.status && previous.failureReason === day.failureReason) {
            continue;
          }

          if (day.status === "generating") {
            writeSseEvent(controller, encoder, "day_started", {
              planId,
              dayId: day.id,
              dayNumber: day.dayNumber,
              status: day.status,
            });
          }

          if (day.status === "success") {
            writeSseEvent(controller, encoder, "day_saved", {
              planId,
              dayId: day.id,
              dayNumber: day.dayNumber,
              status: day.status,
            });
          }

          if (day.status === "failed") {
            writeSseEvent(controller, encoder, "day_failed", {
              planId,
              dayId: day.id,
              dayNumber: day.dayNumber,
              status: day.status,
              failureReason: day.failureReason,
            });
          }

          if (day.status === "retrying") {
            writeSseEvent(controller, encoder, "day_allergen_retry", {
              planId,
              dayId: day.id,
              dayNumber: day.dayNumber,
              message: day.failureReason ?? "Retrying meal slot due to allergen conflict.",
            });
          }

          lastDayState.set(day.id, {
            status: day.status,
            failureReason: day.failureReason,
          });
        }

        if (terminalStatuses.has(currentPlan.generationStatus)) {
          const completedDays = currentDays.filter((day) => day.status === "success").length;
          const failedDays = currentDays.filter((day) => day.status === "failed").length;

          writeSseEvent(controller, encoder, "generation_completed", {
            planId,
            status: currentPlan.generationStatus,
            completedDays,
            failedDays,
          });

          close();
          return { shouldClose: true, savedDayCount: completedDays };
        }

        lastPlanStatus = currentPlan.generationStatus;

        const savedDayCount = currentDays.filter((day) => day.status === "success").length;

        return {
          shouldClose: false,
          savedDayCount,
        };
      };

      const runPollingLoop = async () => {
        while (!closed) {
          const pollStartedAt = Date.now();
          const { shouldClose, savedDayCount } = await pollState();

          if (shouldClose || closed) {
            return;
          }

          const nextIntervalMs = getPollIntervalMs(savedDayCount);

          if (ENABLE_POLL_DEBUG) {
            console.debug("[generation-stream] poll", {
              planId,
              pollTimestamp: new Date(pollStartedAt).toISOString(),
              savedDayCount,
              nextIntervalMs,
            });
          }

          await sleep(nextIntervalMs);
        }
      };

      void runPollingLoop();

      request.signal.addEventListener("abort", close, { once: true });
    },
  });

  return new Response(stream, {
    status: 200,
    headers: createSseHeaders(),
  });
}
