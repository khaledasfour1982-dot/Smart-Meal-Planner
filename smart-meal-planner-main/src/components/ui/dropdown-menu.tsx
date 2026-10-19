"use client";

import * as React from "react";
import { cn } from "~/lib/utils";

const DropdownMenuContext = React.createContext<{
  open: boolean;
  setOpen: (open: boolean) => void;
} | null>(null);

export function DropdownMenu({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);

  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <DropdownMenuContext.Provider value={{ open, setOpen }}>
      <div className="relative inline-block text-left" ref={ref}>
        {children}
      </div>
    </DropdownMenuContext.Provider>
  );
}

export function DropdownMenuTrigger({ children, asChild }: { children: React.ReactNode, asChild?: boolean }) {
  const context = React.useContext(DropdownMenuContext);
  if (!context) throw new Error("DropdownMenuTrigger must be inside DropdownMenu");

  if (asChild && React.isValidElement<{ onClick?: (e: React.MouseEvent) => void; "data-state"?: string }>(children)) {
    return React.cloneElement(children, {
      onClick: (e: React.MouseEvent) => {
        e.stopPropagation();
        if (children.props.onClick) children.props.onClick(e);
        context.setOpen(!context.open);
      },
      "data-state": context.open ? "open" : "closed",
    } as React.HTMLAttributes<HTMLElement> & { onClick: (e: React.MouseEvent) => void });
  }

  return (
    <button 
      type="button" 
      onClick={(e) => {
        e.stopPropagation();
        context.setOpen(!context.open);
      }}
      data-state={context.open ? "open" : "closed"}
    >
      {children}
    </button>
  );
}

export function DropdownMenuContent({
  children,
  className,
  align = "center",
  side = "bottom"
}: {
  children: React.ReactNode;
  className?: string;
  align?: "start" | "center" | "end";
  side?: "top" | "bottom"
}) {
  const context = React.useContext(DropdownMenuContext);
  if (!context?.open) return null;

  const alignClass = align === "end" ? "right-0" : align === "start" ? "left-0" : "left-1/2 -translate-x-1/2";
  const sideClass = side === "top" ? "bottom-full mb-2" : "top-full mt-2";

  return (
    <div
      className={cn(
        "absolute z-50 min-w-32 overflow-hidden rounded-md border border-white/10 bg-zinc-950 p-1 text-white shadow-xl shadow-black/50 animate-in fade-in-80 zoom-in-95",
        alignClass,
        sideClass,
        className
      )}
    >
      {children}
    </div>
  );
}

export function DropdownMenuItem({
  children,
  onClick,
  className,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  const context = React.useContext(DropdownMenuContext);
  return (
    <div
      onClick={() => {
        onClick?.();
        context?.setOpen(false);
      }}
      className={cn(
        "relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-xs sm:text-sm outline-none transition-colors hover:bg-white/10 focus:bg-white/10 focus:text-white data-disabled:pointer-events-none data-disabled:opacity-50",
        className
      )}
    >
      {children}
    </div>
  );
}