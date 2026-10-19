"use client";

import { useState } from "react";
import { Loader2, Zap } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import { api } from "~/trpc/react";
import { cn } from "~/lib/utils";

const TIME_PRESETS = [15, 20, 30] as const;

interface QuickTimeButtonProps {
    mealId: string;
    currentCookTime: number;
    onSimplified?: () => void;
}

export function QuickTimeButton({ mealId, currentCookTime, onSimplified }: QuickTimeButtonProps) {
    const [selectedTime, setSelectedTime] = useState<number | null>(null);
    const [simplified, setSimplified] = useState(false);
    const utils = api.useUtils();

    const simplify = api.meals.simplifyRecipe.useMutation({
        onSuccess: (data) => {
            if (data.alreadyFast) return;
            setSimplified(true);
            void utils.plans.getActivePlan.invalidate();
            onSimplified?.();
        },
        onError: () => setSelectedTime(null),
    });

    if (simplified) {
        return (
            <Badge variant="secondary" className="gap-1 text-xs">
                <Zap className="h-3 w-3 text-primary" />
                Simplified
            </Badge>
        );
    }

    if (TIME_PRESETS.every((mins) => mins >= currentCookTime)) return null;

    return (
        <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground font-medium">Quick:</span>
            {TIME_PRESETS.map((mins) => {
                const isFaster = mins < currentCookTime;
                return (
                    <Button
                        key={mins}
                        variant="outline"
                        size="xs"
                        disabled={!isFaster || simplify.isPending}
                        className={cn(
                            "rounded-full px-2 h-6 text-xs",
                            selectedTime === mins && "border-primary text-primary",
                            !isFaster && "opacity-30 cursor-not-allowed",
                        )}
                        onClick={() => {
                            setSelectedTime(mins);
                            simplify.mutate({ mealId, maxCookTimeMinutes: mins });
                        }}
                    >
                        {simplify.isPending && selectedTime === mins ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                            `${mins}m`
                        )}
                    </Button>
                );
            })}
        </div>
    );
}
