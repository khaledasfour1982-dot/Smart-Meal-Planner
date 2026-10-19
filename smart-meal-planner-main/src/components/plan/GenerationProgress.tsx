import { Loader2, CheckCircle2, AlertCircle, RefreshCw } from "lucide-react";
import { type UseGenerationStreamReturn } from "~/hooks/useGenerationStream";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "~/components/ui/card";
import { cn } from "~/lib/utils";

interface GenerationProgressProps {
  streamState: UseGenerationStreamReturn;
  targetDays: number;
  isBackendBlocking: boolean;
}

function Progress({ value, className }: { value?: number, className?: string }) {
    if (value === undefined) {
        return (
            <div className={cn("relative w-full overflow-hidden rounded-full bg-secondary", className)}>
                <div className="h-full w-1/2 bg-primary flex-1 animate-[indeterminate_1s_infinite_linear] rounded-full" />
            </div>
        );
    }
    return (
        <div className={cn("relative w-full overflow-hidden rounded-full bg-secondary", className)}>
            <div className="h-full bg-primary flex-1 transition-all duration-500 ease-in-out" style={{ width: `${value}%` }} />
        </div>
    );
}

export function GenerationProgress({ streamState, targetDays, isBackendBlocking }: GenerationProgressProps) {
  // If the backend is blocking and we have no stream data, show a fallback progress
  const showFallback = isBackendBlocking && Object.keys(streamState.days).length === 0;

  const totalCompleted = streamState.completedDays + streamState.failedDays;
  const progressValue = showFallback 
    ? undefined // Indeterminate
    : Math.round((totalCompleted / Math.max(targetDays, 1)) * 100);

  const isComplete = streamState.terminalStatus !== null;

  return (
    <Card className="w-full max-w-2xl mx-auto border-white/10 bg-black/40 backdrop-blur-3xl shadow-2xl rounded-[32px] overflow-hidden">
      <CardHeader className="text-center pt-8 pb-4">
        <div className="mx-auto mb-4 flex items-center justify-center">
          {streamState.terminalStatus === "completed" ? (
            <CheckCircle2 className="w-12 h-12 text-green-500" />
          ) : streamState.terminalStatus === "partial_failure" || (streamState.error && streamState.connectionStatus !== "connecting") ? (
            <AlertCircle className="w-12 h-12 text-yellow-500" />
          ) : (
            <RefreshCw className={cn("w-12 h-12 text-primary", streamState.connectionStatus === "connecting" && streamState.error ? "animate-pulse" : "animate-spin")} />
          )}
        </div>
        <CardTitle className="text-2xl font-black uppercase italic tracking-tighter text-white">
          {streamState.terminalStatus === "completed"
            ? "Generation Complete!"
            : streamState.terminalStatus === "partial_failure"
            ? "Generation Completed with Errors"
            : streamState.connectionStatus === "connecting" && streamState.error
            ? "Reconnecting..."
            : "Orchestrating Your Plan"}
        </CardTitle>
        <CardDescription className="text-zinc-400">
          {showFallback 
            ? "Our AI is crafting your meals behind the scenes..."
            : isComplete
            ? `Generated ${streamState.completedDays} days successfully.`
            : `Generating day by day... (${totalCompleted}/${targetDays})`}
        </CardDescription>
      </CardHeader>
      
      <CardContent className="px-8 pb-8 space-y-6">
        <div className="space-y-2">
           <Progress 
             value={progressValue} 
             className={cn("h-3 bg-white/10", showFallback && "animate-pulse")} 
           />
           {!showFallback && (
             <div className="flex justify-between text-xs text-zinc-500 font-medium">
               <span>{Math.round(progressValue ?? 0)}% Complete</span>
               <span>{targetDays - totalCompleted} remaining</span>
             </div>
           )}
        </div>

        {!showFallback && Object.keys(streamState.days).length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 pt-4">
            {Array.from({ length: targetDays }).map((_, index) => {
              const dayNumber = index + 1;
              const dayState = streamState.days[dayNumber];
              const status = dayState?.status ?? "pending";
              
              return (
                <div 
                  key={dayNumber} 
                  className={cn(
                    "flex flex-col items-center justify-center p-3 rounded-xl border border-white/5 bg-white/5 transition-all",
                    status === "generating" && "border-primary/50 bg-primary/10 animate-pulse",
                    status === "success" && "border-green-500/30 bg-green-500/10",
                    status === "failed" && "border-red-500/30 bg-red-500/10",
                  )}
                >
                  <span className="text-xs font-bold text-white/50 uppercase tracking-widest mb-1">
                    Day {dayNumber}
                  </span>
                  
                  {status === "pending" && <span className="text-sm text-zinc-600 font-medium pb-1">Queued</span>}
                  {status === "generating" && <Loader2 className="w-4 h-4 animate-spin text-primary" />}
                  {status === "success" && <CheckCircle2 className="w-4 h-4 text-green-500" />}
                  {status === "failed" && (
                    <div className="flex items-center text-red-400 group relative">
                      <AlertCircle className="w-4 h-4" />
                      <span className="sr-only">{dayState?.failureReason}</span>
                    </div>
                  )}
                  {streamState.retryMessages?.[dayNumber] && (
                    <div className="mt-2 text-[10px] leading-tight text-amber-500 text-center bg-amber-500/10 px-2 py-1 rounded-md border border-amber-500/20">
                      {streamState.retryMessages[dayNumber]}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Display connection error if present */}
        {streamState.error && (
            <div className={cn(
              "text-center text-sm py-2 rounded-lg border",
              streamState.connectionStatus === "connecting"
                ? "text-yellow-400 bg-yellow-950/30 border-yellow-900/50"
                : "text-red-400 bg-red-950/30 border-red-900/50"
            )}>
                {streamState.connectionStatus === "connecting" 
                  ? "Connection interrupted. Reconnecting..." 
                  : streamState.error}
            </div>
        )}

        {/* Partial failure reasoning list */}
        {streamState.failedDays > 0 && (
          <div className="space-y-2 mt-4">
            <h4 className="text-xs font-bold text-red-400 uppercase tracking-wider">Failed Days</h4>
            <ul className="text-sm text-zinc-400 space-y-1">
              {Object.values(streamState.days)
                .filter(d => d.status === "failed")
                .map(d => (
                  <li key={d.dayNumber} className="flex gap-2">
                    <span className="font-bold text-zinc-300">Day {d.dayNumber}:</span>
                    <span>{d.failureReason || "Failed to generate"}</span>
                  </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}