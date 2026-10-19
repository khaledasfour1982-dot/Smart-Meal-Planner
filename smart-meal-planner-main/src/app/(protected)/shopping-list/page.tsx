// src/app/(protected)/shopping-list/page.tsx
"use client";

import { Suspense } from "react";
import { api } from "~/trpc/react";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { ShoppingBag, Calendar, ListTodo, ArrowRight, BookOpen } from "lucide-react";

export default function ShoppingListsPage() {
  return (
    <div className="container mx-auto max-w-5xl p-4 md:p-8 space-y-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Shopping Lists</h1>
          <p className="text-muted-foreground mt-1">
            Manage your generated shopping lists from meal plans.
          </p>
        </div>
        <Button asChild className="w-full sm:w-auto shrink-0">
          <Link href="/plan">
            <Calendar className="mr-2 h-4 w-4" />
            View Meal Plan
          </Link>
        </Button>
      </div>

      <Suspense fallback={<ShoppingListSkeleton />}>
        <ShoppingListGrid />
      </Suspense>
    </div>
  );
}

function ShoppingListSkeleton() {
  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {[1, 2, 3].map((i) => (
        <Card key={i} className="animate-pulse flex flex-col pt-0">
          <CardHeader className="pb-3 pt-6 border-b border-border/40 bg-muted/20">
            <div className="h-5 w-2/3 bg-muted rounded"></div>
            <div className="h-3 w-1/3 bg-muted rounded mt-3"></div>
          </CardHeader>
          <CardContent className="pt-4 flex-grow">
            <div className="space-y-4">
              <div className="h-4 w-1/2 bg-muted rounded"></div>
              <div className="h-6 w-1/3 bg-muted rounded"></div>
            </div>
            <div className="mt-12 flex justify-end">
               <div className="h-8 w-8 bg-muted rounded-full"></div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// Client component for the grid
function ShoppingListGrid() {
  const [lists] = api.shoppingList.getLists.useSuspenseQuery();

  if (!lists?.length) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed p-12 text-center bg-muted/20 animate-in fade-in-50">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 mb-5 text-primary">
          <ShoppingBag className="h-8 w-8" />
        </div>
        <h3 className="mb-2 text-xl font-semibold">No shopping lists found</h3>
        <p className="mb-6 max-w-sm text-balance text-muted-foreground">
          You don't have any saved shopping lists yet. Generate one from your active meal plan to see it here!
        </p>
        <Button asChild variant="outline" className="gap-2 border-primary/20 hover:bg-primary/5">
          <Link href="/plan">
            <BookOpen className="h-4 w-4 text-primary" />
            Go to Meal Plan
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 animate-in fade-in-50 slide-in-from-bottom-4 duration-500">
      {lists.map((list) => {
        const itemCount = Array.isArray(list.items) ? list.items.length : 0;
        const listName = list.name || "Unnamed Shopping List";
        
        return (
          <Link 
            key={list.id} 
            href={`/shopping-list/${list.id}`} 
            className="group block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xl"
          >
            <Card className="h-full transition-all duration-300 hover:shadow-md hover:border-primary/50 flex flex-col pt-0 overflow-hidden">
              <CardHeader className="pb-3 pt-5 border-b border-border/40 bg-muted/20 relative">
                <div className="absolute top-0 right-0 right-5 bottom-0 my-auto h-1 w-1 rounded-full group-hover:scale-[100] group-hover:bg-primary/5 transition-transform duration-500 z-0"></div>
                <div className="flex items-start justify-between relative z-10">
                  <div className="space-y-1.5">
                    <CardTitle className="line-clamp-1 group-hover:text-primary transition-colors text-lg">
                      {listName}
                    </CardTitle>
                    <CardDescription className="flex items-center text-xs">
                      <Calendar className="mr-1.5 h-3 w-3" />
                      {new Date(list.createdAt).toLocaleDateString("en-US", { 
                        month: "short", day: "numeric", year: "numeric" 
                      })}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              
              <CardContent className="pt-5 flex-grow flex flex-col justify-between bg-card relative z-10">
                <div className="space-y-4">
                  <div className="flex items-center text-sm">
                    <div className="flex items-center justify-center p-1.5 rounded-md bg-primary/10 mr-3">
                      <ListTodo className="h-4 w-4 text-primary" />
                    </div>
                    <span className="font-medium text-foreground">{itemCount} items to buy</span>
                  </div>
                  
                  {list.scope === "plan" && list.scopeId && (
                    <div className="text-xs text-muted-foreground bg-muted/50 rounded-md px-2.5 py-1.5 inline-flex items-center border border-border/50">
                      <span>Source:</span>
                      <span className="font-mono ml-1.5 text-foreground/80">Plan #{list.scopeId.slice(0, 8)}</span>
                    </div>
                  )}
                </div>
                
                <div className="mt-8 flex items-center justify-end">
                  <span className="text-sm font-medium text-primary invisible opacity-0 group-hover:visible group-hover:opacity-100 transition-all -translate-x-3 group-hover:-translate-x-1 mr-2">
                    Open List
                  </span>
                  <div className="rounded-full bg-primary/10 p-2 text-primary transition-all duration-300 group-hover:bg-primary group-hover:text-primary-foreground group-active:scale-95 shadow-sm">
                    <ArrowRight className="h-4 w-4 group-hover:-rotate-45 transition-transform" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}

