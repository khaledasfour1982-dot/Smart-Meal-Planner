"use client";

import React, { useState, useEffect } from "react";
import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import { Utensils, ChevronDown, ShoppingBag, Plus } from "lucide-react";
import { cn } from "~/lib/utils";
import { useRouter } from "next/navigation";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "~/components/ui/dropdown-menu";

interface ShoppingListButtonProps {
  planId: string;
  onCreateNew: () => void;
  isGenerating?: boolean;
}

export function ShoppingListButton({
  planId,
  onCreateNew,
  isGenerating,
}: ShoppingListButtonProps) {
  const router = useRouter();
  const { data: lists } = api.shoppingList.getLists.useQuery(undefined, {
    enabled: !!planId,
  });

  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  const existingLists = React.useMemo(() => {
    if (!lists || !planId) return [];
    return lists
      .filter((l) => l.scope === "plan" && l.scopeId === planId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [lists, planId]);

  const latestList = existingLists.length > 0 ? existingLists[0] : null;

  const handleCreateNew = () => {
    if (existingLists.length > 0) {
      setToastMessage("Your existing list won't be deleted. Find all lists in Shopping Lists.");
    }
    onCreateNew();
  };

  const handleViewList = () => {
    if (latestList) {
      router.push(`/shopping-list/${latestList.id}`);
    }
  };

  return (
    <div className="relative inline-flex">
      {/* Local Toast */}
      {toastMessage && (
        <div className="absolute top-[calc(100%+0.5rem)] md:top-auto md:bottom-[calc(100%+0.5rem)] right-0 z-50 pointer-events-none select-none bg-zinc-900 border border-white/20 text-white text-[11px] font-medium px-4 py-2.5 rounded-xl shadow-2xl w-max max-w-70 text-left leading-tight animate-in fade-in zoom-in-95">
          {toastMessage}
        </div>
      )}

      {!latestList ? (
        <Button
          onClick={handleCreateNew}
          disabled={isGenerating}
          className="h-10 md:h-11 w-full sm:w-auto px-4 md:px-6 rounded-xl md:rounded-2xl font-black text-[9px] md:text-[10px] uppercase tracking-widest bg-emerald-600 hover:bg-emerald-500 text-white shadow-none flex gap-1.5 justify-center"
        >
          <Utensils className={cn("h-3 w-3", isGenerating && "animate-spin")} />
          <span>{isGenerating ? "Generating..." : "Create Shopping List"}</span>
        </Button>
      ) : (
        <div className="flex w-full sm:w-auto rounded-xl md:rounded-2xl divide-x divide-emerald-800">
          <Button
            onClick={handleViewList}
            disabled={isGenerating}
            className="flex-1 sm:flex-none h-10 md:h-11 px-4 md:px-6 rounded-l-xl rounded-r-none md:rounded-l-2xl md:rounded-r-none font-black text-[9px] md:text-[10px] uppercase tracking-widest bg-emerald-600 hover:bg-emerald-500 text-white shadow-none border-none justify-center gap-1.5"
          >
            <ShoppingBag className="h-3 w-3" />
            <span>View Shopping List</span>
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                disabled={isGenerating}
                className="h-10 md:h-11 px-2.5 rounded-l-none rounded-r-xl md:rounded-l-none md:rounded-r-2xl font-black text-[9px] md:text-[10px] uppercase tracking-widest bg-emerald-600 hover:bg-emerald-500 text-white shadow-none border-none group"
              >
                <ChevronDown className="h-4 w-4 transition-transform group-data-[state=open]:rotate-180" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 mt-2 pb-1 border-white/20">
              <DropdownMenuItem onClick={handleViewList} className="flex gap-2.5 items-center py-2.5 px-3 cursor-pointer text-sm font-medium hover:bg-white/10 rounded-sm outline-none">
                <ShoppingBag className="h-4 w-4" />
                <span>View Shopping List</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleCreateNew} className="flex gap-2.5 items-center py-2.5 px-3 cursor-pointer text-sm font-medium hover:bg-white/10 rounded-sm outline-none">
                <Plus className="h-4 w-4" />
                <span>Create New List</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  );
}
