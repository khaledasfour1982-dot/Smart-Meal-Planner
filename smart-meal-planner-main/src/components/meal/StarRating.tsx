"use client";

import { useState } from "react";
import { Star } from "lucide-react";
import { cn } from "~/lib/utils";

interface StarRatingProps {
  recipeName: string;
  currentRating: number | undefined;
  onRate: (rating: number) => void;
  disabled?: boolean;
  className?: string;
}

export function StarRating({
  recipeName,
  currentRating = 0,
  onRate,
  disabled = false,
  className,
}: StarRatingProps) {
  const [hoveredStar, setHoveredStar] = useState<number | null>(null);

  return (
    <div
      className={cn(
        "flex gap-px md:gap-0.5",
        className
      )}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onMouseLeave={() => !disabled && setHoveredStar(null)}
    >
      {[1, 2, 3, 4, 5].map((starIdx) => {
        const isCurrentHovered = hoveredStar === starIdx;
        const isPreviousHovered = hoveredStar !== null && starIdx < hoveredStar;
        const isFilled = currentRating >= starIdx;

        let starClasses = "text-zinc-300 drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]";

        if (hoveredStar !== null) {
          if (isPreviousHovered) {
            starClasses = "fill-amber-300 text-amber-300";
          } else if (isCurrentHovered) {
            starClasses = "fill-amber-500 text-amber-500";
          }
        } else if (isFilled) {
          starClasses = "fill-amber-400 text-amber-400";
        }

        return (
          <button
            key={starIdx}
            type="button"
            aria-label={`Rate ${recipeName} ${starIdx} stars`}
            className="focus:outline-none p-0.5 hover:scale-110 transition-all touch-manipulation disabled:opacity-50 disabled:hover:scale-100"
            onMouseEnter={() => !disabled && setHoveredStar(starIdx)}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (!disabled) {
                onRate(starIdx);
              }
            }}
            disabled={disabled}
          >
            <Star
              className={cn(
                "w-3 h-3 md:w-3.5 md:h-3.5 transition-colors",
                starClasses
              )}
            />
          </button>
        );
      })}
    </div>
  );
}