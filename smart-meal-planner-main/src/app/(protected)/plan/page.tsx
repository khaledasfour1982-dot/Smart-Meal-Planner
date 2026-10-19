"use client";

import { useState, useEffect, useMemo } from "react";
import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Loader2, Clock, RefreshCw, Calendar, Sparkles, LayoutDashboard, Utensils, Coffee, Moon, Cookie, GlassWater, History, AlertTriangle, Eye } from "lucide-react";
import { Badge } from "~/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "~/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "~/components/ui/sheet";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "~/lib/utils";
import { type inferRouterOutputs } from "@trpc/server";
import { type AppRouter } from "~/server/api/root";
import { useMutationState } from "@tanstack/react-query";

import { StarRating } from "~/components/meal/StarRating";
import { useGenerationStream } from "~/hooks/useGenerationStream";
import { GenerationProgress } from "~/components/plan/GenerationProgress";
import { ShoppingListButton } from "~/components/shopping/shopping-list-button";

// Types
type RouterOutputs = inferRouterOutputs<AppRouter>;
type HistoryPlan = RouterOutputs["plans"]["getHistory"]["plans"][number];

type MealType = "breakfast" | "lunch" | "dinner";
const ALL_MEAL_TYPES: MealType[] = ["breakfast", "lunch", "dinner"];

export default function PlannerPage() {
    const [days, setDays] = useState(4);
    type MealsPerDay = "1" | "2" | "3";
    const [mealsPerDay, setMealsPerDay] = useState<MealsPerDay>("3");

    const [regenDays, setRegenDays] = useState<number | undefined>(undefined);
    const [regenMeals, setRegenMeals] = useState<MealsPerDay | undefined>(undefined);

    const [selectedHistoryPlanId, setSelectedHistoryPlanId] = useState<string | null>(null);
    const [selectedHistoryViewPlanId, setSelectedHistoryViewPlanId] = useState<string | null>(null);
    const [allergenWarningPlanId, setAllergenWarningPlanId] = useState<string | null>(null);
    const [conflictingMealSummary, setConflictingMealSummary] = useState<string>("");

    const INITIAL_VISIBLE = 6;
    const LOAD_MORE_INCREMENT = 3;
    const [historyOffset, setHistoryOffset] = useState(0);
    const [historyLimit, setHistoryLimit] = useState(INITIAL_VISIBLE);
    const [loadedHistoryPlans, setLoadedHistoryPlans] = useState<HistoryPlan[]>([]);

    const [isDesktop, setIsDesktop] = useState(true);
    useEffect(() => {
        const mediaQuery = window.matchMedia("(min-width: 768px)");
        setIsDesktop(mediaQuery.matches);
        const listener = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
        mediaQuery.addEventListener("change", listener);
        return () => mediaQuery.removeEventListener("change", listener);
    }, []);

    const [showScopeSelector, setShowScopeSelector] = useState(false);
    const [scopeSelectedDays, setScopeSelectedDays] = useState<Set<string>>(new Set());

    const { data: activePlan, isLoading: isLoadingPlan, refetch: refetchPlan } = api.plans.getActivePlan.useQuery();

    const { data: viewPlan, isLoading: isLoadingViewPlan } = api.plans.getHistoryPlanById.useQuery(
        { planId: selectedHistoryViewPlanId ?? "" },
        { enabled: !!selectedHistoryViewPlanId }
    );

    const allRecipeNames = useMemo(() => {
        const names = new Set<string>();
        const addRecipes = (plan: unknown) => {
            const p = plan as { days?: { meals?: { recipeName?: string }[] }[] };
            if (!p?.days) return;
            p.days.forEach((day) => {
                day.meals?.forEach((meal) => {
                    if (meal.recipeName) names.add(meal.recipeName);
                });
            });
        };
        addRecipes(activePlan);
        addRecipes(viewPlan);
        loadedHistoryPlans.forEach((plan) => addRecipes(plan));
        return Array.from(names);
    }, [activePlan, viewPlan, loadedHistoryPlans]);

    const { data: ratingsData = {} } = api.feedback.getForPlan.useQuery(
        { recipeNames: allRecipeNames },
        { enabled: allRecipeNames.length > 0 }
    );

    const apiUtils = api.useUtils();
    const rateMutation = api.feedback.rate.useMutation({
        onMutate: async (newRating) => {
            await apiUtils.feedback.getForPlan.cancel();
            const previousRatings = apiUtils.feedback.getForPlan.getData({ recipeNames: allRecipeNames });
            if (previousRatings) {
                apiUtils.feedback.getForPlan.setData(
                    { recipeNames: allRecipeNames },
                    { ...previousRatings, [newRating.recipeName.toLowerCase()]: newRating.rating }
                );
            }
            return { previousRatings };
        },
        onError: (err, newRating, context) => {
            if (context?.previousRatings) {
                apiUtils.feedback.getForPlan.setData(
                    { recipeNames: allRecipeNames },
                    context.previousRatings
                );
            }
        },
        onSettled: async () => {
            await apiUtils.feedback.getForPlan.invalidate({ recipeNames: allRecipeNames });
        }
    });

    const { data: historyData, isFetching: isFetchingHistory, refetch: refetchHistory } = api.plans.getHistory.useQuery(
        { limit: historyLimit, offset: historyOffset },
        { placeholderData: (prev) => prev }
    );

    useEffect(() => {
        if (historyData?.plans) {
            if (historyOffset === 0) {
                setLoadedHistoryPlans(historyData.plans);
            } else {
                setLoadedHistoryPlans(prev => {
                    const existingIds = new Set(prev.map(p => p.id));
                    const newPlans = historyData.plans.filter(p => !existingIds.has(p.id));
                    return [...prev, ...newPlans];
                });
            }
        }
    }, [historyData, historyOffset]);

    const resetHistoryAndRefetch = async () => {
        setHistoryOffset(0);
        setHistoryLimit(INITIAL_VISIBLE);
        await refetchHistory();
    };

    const currentRegenDays = regenDays ?? activePlan?.planDays ?? days;
    const currentRegenMeals = regenMeals ?? mealsPerDay;

    const [activeStreamPlanId, setActiveStreamPlanId] = useState<string | null>(null);

    const generateMutation = api.plan.generate.useMutation({
        onSuccess: async (data) => {
            if (data?.planId) {
                setActiveStreamPlanId(data.planId);
            }
            await refetchPlan();
            await resetHistoryAndRefetch();
        },
    });

    const regenerateFullMutation = api.plans.regenerateFull.useMutation({
        onSuccess: async (data) => {
            if (data && typeof data === 'object' && 'planId' in data && typeof data.planId === 'string') {
                setActiveStreamPlanId(data.planId);
            }
            await refetchPlan();
            await resetHistoryAndRefetch();
        },
    });

    const regenerateDayMutation = api.plans.regenerateDay.useMutation({
        onSuccess: async () => await refetchPlan(),
    });

    const swapMealMutation = api.plans.swapMeal.useMutation({
        onSuccess: async () => await refetchPlan(),
    });

    const router = useRouter();
    const generateListMutation = api.shoppingList.generateList.useMutation({
        onSuccess: async (list) => {
            // Invalidate getLists query so ShoppingListButton shows dropdown immediately
            await apiUtils.shoppingList.getLists.invalidate();
            router.push(`/shopping-list/${list.id}`);
        },
        onError: (err) => {
            console.error("Failed to generate list for plan:", err);
        },
    });

    const restorePlanMutation = api.plans.restorePlan.useMutation({
        onSuccess: async (data, variables) => {
            if (data.requiresAllergenConfirmation) {
                setAllergenWarningPlanId(variables.planId);
                setConflictingMealSummary(data.conflictingSummary ?? "Some meals may conflict with your current allergens.");
                setSelectedHistoryPlanId(null);
            } else {
                await refetchPlan();
                await resetHistoryAndRefetch();
                setSelectedHistoryPlanId(null);
                setAllergenWarningPlanId(null);
                setConflictingMealSummary("");
            }
        },
    });

    const handleRestoreConfirm = () => {
        if (selectedHistoryPlanId) {
            restorePlanMutation.mutate({ planId: selectedHistoryPlanId, acknowledgedAllergenRisk: false });
        }
    };

    const handleAllergenConfirm = () => {
        if (allergenWarningPlanId) {
            restorePlanMutation.mutate({ planId: allergenWarningPlanId, acknowledgedAllergenRisk: true });
        }
    };

    const handleGenerate = () => generateMutation.mutate({ days, mealsPerDay });

    const handleRegenerateFull = () => {
        if (confirm("Are you sure you want to regenerate the entire plan?")) {
            regenerateFullMutation.mutate({
                planDays: currentRegenDays,
                mealsPerDay: parseInt(currentRegenMeals, 10),
            });
        }
    };

    const executeGenerateList = (scope: "plan" | "day", scopeId: string, dayIds?: string[]) => {
        setShowScopeSelector(false);
        generateListMutation.mutate({ scope, scopeId, dayIds });
    };

    // Global listener for mutations (so we see what the Chatbot is doing)
    const activeSwaps = useMutationState({
        filters: { status: 'pending', mutationKey: [['plans', 'swapMeal']] },
        select: (mutation) => mutation.state.variables as { dayNumber: number; mealType: string } | undefined,
    });

    const activeDayRegens = useMutationState({
        filters: { status: 'pending', mutationKey: [['plans', 'regenerateDay']] },
        select: (mutation) => mutation.state.variables as { dayNumber: number } | undefined,
    });

    // Progressive generation hook
    const streamState = useGenerationStream(activeStreamPlanId);

    // If we load the page and there's an in-progress plan but no active stream, hook it up!
    useEffect(() => {
        if (activePlan?.generationStatus === "in_progress" && !activeStreamPlanId) {
            setActiveStreamPlanId(activePlan.id);
        }
    }, [activePlan?.generationStatus, activePlan?.id, activeStreamPlanId]);

    useEffect(() => {
        if (streamState.terminalStatus === "completed" || streamState.terminalStatus === "partial_failure") {
            const fetchLatestPlan = async () => {
                await refetchPlan();
                setActiveStreamPlanId(null);
            };
            fetchLatestPlan().catch(console.error);
        }
    }, [streamState.terminalStatus, refetchPlan]);

    const isCurrentlyGenerating = activePlan?.generationStatus === "in_progress" || generateMutation.isPending || regenerateFullMutation.isPending || streamState.isGenerating || (streamState.terminalStatus === null && streamState.connectionStatus === "connected");

    const isAnyMutationPending = generateMutation.isPending || regenerateFullMutation.isPending || regenerateDayMutation.isPending || swapMealMutation.isPending || restorePlanMutation.isPending || activeSwaps.length > 0 || activeDayRegens.length > 0;

    const fallbackUrl = "/images/auth/login-bg.jpg";
    
    function generatePixabayUrl(recipeName: string) {
        const cleanQuery = recipeName
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, "")
            .replace(/\s+/g, "-");
        return `https://pixabay.com/images/search/recipe-${cleanQuery}/`;
    }

    if (isLoadingPlan) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-zinc-950">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
            </div>
        );
    }

    const renderHeaderDays = () => {
        if (!activePlan) return null;
        const baseDate = activePlan.startDate ? new Date(activePlan.startDate) : (activePlan.createdAt ? new Date(activePlan.createdAt) : new Date());
        const today = new Date();
        const isSameDay = (d1: Date, d2: Date) => d1.getDate() === d2.getDate() && d1.getMonth() === d2.getMonth() && d1.getFullYear() === d2.getFullYear();

        return activePlan.days.map((day) => {
            const currentDate = new Date(baseDate);
            currentDate.setDate(baseDate.getDate() + (day.dayNumber - 1));
            const isToday = isSameDay(currentDate, today);
            
            // Check global state for day regeneration (AI or Manual)
            const isDayRegenerating = activeDayRegens.some(r => r?.dayNumber === day.dayNumber);
            
            return (
                <div key={day.id} className={cn(
                    "px-1 py-4 md:py-6 text-center flex flex-col justify-center relative group transition-all border-r border-white/5 last:border-r-0",
                    isToday ? "bg-primary/20 shadow-[inset_0_0_20px_rgba(var(--primary),0.1)]" : "bg-black/40"
                )}>
                    <span className={cn("text-[9px] font-black uppercase tracking-widest", isToday ? "text-white" : "text-white/40")}>
                        {currentDate.toLocaleDateString('en-US', { weekday: 'short' })}
                    </span>
                    <span className={cn("text-xl md:text-2xl font-black mt-1", isToday ? "text-white" : "text-white/80")}>
                        {currentDate.getDate()}
                    </span>
                    <Button 
                        variant="ghost" size="icon" 
                        title="Regenerate Day"
                        className="absolute top-1 right-1 h-6 w-6 md:h-7 md:w-7 rounded-full bg-white/10 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-all hover:bg-primary hover:text-white shadow-sm border border-white/10"
                        onClick={() => regenerateDayMutation.mutate({ dayNumber: day.dayNumber })}
                        disabled={isAnyMutationPending}
                    >
                        <RefreshCw className={cn("h-3 w-3 text-white", isDayRegenerating && "animate-spin")} />
                    </Button>
                </div>
            );
        });
    };

    const toggleScopeSelectedDay = (dayId: string) => {
        setScopeSelectedDays(prev => {
            const next = new Set(prev);
            if (next.has(dayId)) next.delete(dayId);
            else next.add(dayId);
            return next;
        });
    };

    const toggleAllScopeSelectedDays = () => {
        if (!activePlan) return;
        if (scopeSelectedDays.size === activePlan.days.length) {
            setScopeSelectedDays(new Set());
        } else {
            setScopeSelectedDays(new Set(activePlan.days.map(d => d.id)));
        }
    };

    const renderScopeSelectorContent = () => {
        if (!activePlan) return null;
        
        return (
            <div className="space-y-6 mt-2 pb-12 px-1">
                {/* A) Entire Week */}
                <section className="space-y-3">
                    <h3 className="text-xl font-black uppercase italic tracking-tighter text-zinc-100 flex items-center gap-2">
                        <Calendar className="h-5 w-5 text-emerald-400" />
                        Entire Plan
                    </h3>
                    <Button 
                        className="w-full h-auto py-4 bg-white/5 hover:bg-white/10 border border-white/10 justify-start px-6 gap-4 group rounded-2xl transition-all"
                        onClick={() => executeGenerateList("plan", activePlan.id)}
                    >
                        <div className="h-10 w-10 rounded-full bg-emerald-500/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                            <Sparkles className="h-5 w-5 text-emerald-400" />
                        </div>
                        <div className="flex flex-col items-start gap-1">
                            <span className="font-black italic uppercase tracking-widest text-sm text-zinc-100">Generate For All Days</span>
                            <span className="text-xs text-zinc-400 font-medium normal-case">Get everything you need for {activePlan.days.length} days</span>
                        </div>
                    </Button>
                </section>

                <div className="h-px w-full bg-white/5" />

                {/* B) Specific Day */}
                <section className="space-y-3">
                    <h3 className="text-xl font-black uppercase italic tracking-tighter text-zinc-100 flex items-center gap-2">
                        <Sparkles className="h-5 w-5 text-emerald-400" />
                        Specific Day
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {activePlan.days.map((day) => {
                            const lunch = day.meals.find(m => m.mealType === 'lunch')?.recipeName || "No lunch planned";
                            const dinner = day.meals.find(m => m.mealType === 'dinner')?.recipeName || "No dinner planned";
                            const baseDate = activePlan.startDate ? new Date(activePlan.startDate) : (activePlan.createdAt ? new Date(activePlan.createdAt) : new Date());
                            const currentDate = new Date(baseDate);
                            currentDate.setDate(baseDate.getDate() + (day.dayNumber - 1));
                            const dayLabel = currentDate.toLocaleDateString('en-US', { weekday: 'long' });
                            return (
                                <Button 
                                    key={day.id}
                                    variant="outline"
                                    className="h-auto py-3 bg-white/5 border-white/10 hover:border-emerald-500/50 hover:bg-white/10 flex flex-col items-start gap-1.5 justify-start px-4 text-left whitespace-normal rounded-2xl transition-all"
                                    onClick={() => executeGenerateList("day", day.id)}
                                >
                                    <span className="font-black italic uppercase text-emerald-400 text-sm tracking-widest mb-0.5 drop-shadow-sm">{dayLabel} <span className="text-zinc-500 ml-1 text-xs">Day {day.dayNumber}</span></span>
                                    <span className="text-[11px] text-zinc-300 line-clamp-1 flex gap-1.5 items-center w-full"><Utensils className="h-3 w-3 shrink-0 text-sky-400"/> {lunch}</span>
                                    <span className="text-[11px] text-zinc-300 line-clamp-1 flex gap-1.5 items-center w-full"><Moon className="h-3 w-3 shrink-0 text-indigo-400"/> {dinner}</span>
                                </Button>
                            );
                        })}
                    </div>
                </section>

                <div className="h-px w-full bg-white/5" />

                {/* C) Choose Days */}
                <section className="space-y-3">
                    <div className="flex items-center justify-between">
                        <h3 className="text-xl font-black uppercase italic tracking-tighter text-zinc-100 flex items-center gap-2">
                            <Utensils className="h-5 w-5 text-emerald-400" />
                            Choose Days
                        </h3>
                        <Button variant="ghost" size="sm" onClick={toggleAllScopeSelectedDays} className="text-[10px] uppercase font-black tracking-widest text-emerald-400 hover:text-emerald-300 hover:bg-emerald-400/10 h-7 px-3 rounded-full">
                            {scopeSelectedDays.size === activePlan.days.length ? "Deselect All" : "Select All"}
                        </Button>
                    </div>
                    
                    <div className="grid gap-2">
                        {activePlan.days.map((day) => {
                            const isSelected = scopeSelectedDays.has(day.id);
                            const lunch = day.meals.find(m => m.mealType === 'lunch')?.recipeName || "No lunch planned";
                            const dinner = day.meals.find(m => m.mealType === 'dinner')?.recipeName || "No dinner planned";
                            const baseDate = activePlan.startDate ? new Date(activePlan.startDate) : (activePlan.createdAt ? new Date(activePlan.createdAt) : new Date());
                            const currentDate = new Date(baseDate);
                            currentDate.setDate(baseDate.getDate() + (day.dayNumber - 1));
                            const dayLabel = currentDate.toLocaleDateString('en-US', { weekday: 'long' });

                            return (
                                <div 
                                    key={day.id}
                                    onClick={() => toggleScopeSelectedDay(day.id)}
                                    className={cn(
                                        "flex items-center gap-4 p-4 rounded-2xl border transition-all cursor-pointer shadow-sm relative overflow-hidden",
                                        isSelected 
                                            ? "bg-emerald-500/10 border-emerald-500/50" 
                                            : "bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20"
                                    )}
                                >
                                    <div className={cn(
                                        "h-5 w-5 rounded-full flex items-center justify-center shrink-0 border-2 transition-colors",
                                        isSelected ? "bg-emerald-500 border-emerald-500" : "border-zinc-600 bg-transparent"
                                    )}>
                                        {isSelected && <svg viewBox="0 0 14 14" fill="none" className="w-3.5 h-3.5 text-white"><path d="M3 7.5L5.5 10L11 4" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="font-black italic uppercase text-sm tracking-widest text-zinc-100 flex items-baseline gap-2">
                                            {dayLabel} 
                                            <span className="text-zinc-500 text-[10px]">Day {day.dayNumber}</span>
                                        </div>
                                        <div className="text-[11px] text-zinc-400 flex flex-wrap gap-x-4 gap-y-1 mt-1">
                                            <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-sky-400" /> {lunch}</span>
                                            <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-indigo-400" /> {dinner}</span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    
                    <Button 
                        className="w-full mt-6 h-14 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black italic uppercase tracking-widest text-sm disabled:opacity-50 disabled:bg-white/5 disabled:border-white/10 disabled:border disabled:text-zinc-500 disabled:cursor-not-allowed shadow-xl transition-all"
                        disabled={scopeSelectedDays.size === 0}
                        onClick={() => executeGenerateList("plan", activePlan.id, Array.from(scopeSelectedDays))}
                    >
                        Generate for {scopeSelectedDays.size} Selected {scopeSelectedDays.size === 1 ? 'Day' : 'Days'}
                    </Button>
                </section>
            </div>
        );
    };

    const ViewContent = () => {
        if (isLoadingViewPlan) return <div className="flex h-40 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
        if (!viewPlan) return <div className="flex h-40 items-center justify-center text-zinc-400 font-medium">Plan not found</div>;
        
        const planStart = new Date(viewPlan.startDate ?? viewPlan.createdAt);
        const planEnd = new Date(planStart);
        planEnd.setDate(planStart.getDate() + Math.max(viewPlan.planDays - 1, 0));

        return (
            <div className="flex flex-col min-h-0 h-full gap-4 max-h-[70vh]">
                <div className="flex flex-col gap-1 px-1 shrink-0">
                    <span className="text-zinc-300 text-sm font-semibold">
                        {planStart.toLocaleDateString()} - {planEnd.toLocaleDateString()}
                    </span>
                    <span className="text-zinc-500 text-xs font-medium">
                        {viewPlan.planDays} Days • {viewPlan.days.flatMap(d => d.meals).length} Meals
                    </span>
                </div>

                <div className="flex-1 overflow-y-auto pr-3 -mr-3">
                    <div className="space-y-6 pb-6">
                        {viewPlan.days.map((day) => {
                            const dayDate = new Date(planStart);
                            dayDate.setDate(planStart.getDate() + (day.dayNumber - 1));
                            return (
                                <div key={day.id} className="space-y-3">
                                    <h4 className="text-white font-black uppercase text-xs border-b border-white/10 pb-2 flex items-center justify-between">
                                        <span>Day {day.dayNumber}</span>
                                        <span className="text-zinc-500 font-semibold tracking-wide">{dayDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                                    </h4>
                                    <div className="space-y-2">
                                        {day.meals.map(meal => (
                                            <Link key={meal.id} href={`/meals/${meal.id}`} className="block group outline-none">
                                                <div className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/5 hover:border-white/20 transition-all shadow-sm">
                                                    <Badge className="bg-primary/10 text-primary uppercase text-[9px] font-black border-none w-16 justify-center shrink-0">
                                                        {meal.mealType}
                                                    </Badge>
                                                    <div className="flex-1 min-w-0 flex flex-col justify-center">
                                                        <p className="text-zinc-200 text-sm md:text-xs font-bold line-clamp-1 italic group-hover:text-white transition-colors">
                                                            {meal.recipeName}
                                                        </p>
                                                        <div className="flex items-center gap-3 mt-1.5 md:mt-1">
                                                            {meal.cookTimeMinutes && (
                                                                <span className="text-zinc-500 text-[10px] md:text-[9px] font-semibold uppercase flex items-center shrink-0">
                                                                    <Clock className="w-3 h-3 md:w-2.5 md:h-2.5 mr-1" />
                                                                    {meal.cookTimeMinutes}m
                                                                </span>
                                                            )}
                                                            <div className="flex-1 flex justify-end">
                                                                <StarRating 
                                                                    recipeName={meal.recipeName}
                                                                    currentRating={ratingsData?.[meal.recipeName.toLowerCase()] || 0}
                                                                    onRate={(rating) => rateMutation.mutate({ recipeName: meal.recipeName, rating })}
                                                                    disabled={rateMutation.isPending}
                                                                    className="opacity-100 scale-100 md:scale-90 md:origin-right transform-gpu"
                                                                />
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </Link>
                                        ))}
                                        {day.meals.length === 0 && (
                                            <div className="text-center py-3 bg-white/5 rounded-xl border border-dashed border-white/10 text-zinc-500 font-medium text-xs italic">
                                                No meals planned
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>
            </div>
        );
    };

    const renderPastPlans = (isFullWidth: boolean = false) => {
        if (!loadedHistoryPlans || loadedHistoryPlans.length === 0) return null;

        const totalHistory = historyData?.total ?? 0;
        const visiblePlans = loadedHistoryPlans;
        const hasMore = loadedHistoryPlans.length < totalHistory;
        const canShowLess = loadedHistoryPlans.length > INITIAL_VISIBLE;

        const handleShowMore = () => {
            setHistoryLimit(LOAD_MORE_INCREMENT);
            setHistoryOffset(loadedHistoryPlans.length);
        };

        const handleShowLess = () => {
            setHistoryLimit(INITIAL_VISIBLE);
            setHistoryOffset(0);
        };

        return (
            <div className={cn("mt-12", isFullWidth ? "md:mt-24" : "md:mt-16 w-full")}>
                <div className="flex items-center gap-3 mb-8">
                    <History className="w-5 h-5 text-zinc-400" />
                    <h2 className="text-2xl font-black uppercase tracking-tight text-white mb-0 italic">Past Plans</h2>
                    <span className="text-zinc-500 font-medium">({totalHistory})</span>
                </div>
                <div className={cn("grid gap-6", isFullWidth ? "grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" : "grid-cols-1 md:grid-cols-2 xl:grid-cols-3")}>
                    {visiblePlans.map((plan: HistoryPlan) => {
                        const planStart = new Date(plan.startDate ?? plan.createdAt);
                        const planEnd = new Date(planStart);
                        planEnd.setDate(planStart.getDate() + Math.max(plan.planDays - 1, 0));
                        const mealCount = typeof plan.mealCount === "number" ? plan.mealCount : 0;
                        const previewSlots = Math.min(mealCount, 4);
                        const overflowCount = Math.max(mealCount - 4, 0);

                        return (
                            <Card key={plan.id} className="bg-white/5 border-white/10 backdrop-blur-md overflow-hidden flex flex-col hover:border-white/20 transition-colors">
                                <CardHeader className="p-5 border-b border-white/5 bg-black/20">
                                    <div className="flex justify-between items-center text-white text-base font-semibold">
                                        <span>{planStart.toLocaleDateString()} - {planEnd.toLocaleDateString()}</span>
                                        <Badge variant="outline" className="border-white/20 text-white/70 bg-transparent text-[10px]">
                                            {plan.planDays} Days
                                        </Badge>
                                    </div>
                                    <p className="mt-2 text-xs text-zinc-400">
                                        Generated: {new Date(plan.createdAt).toLocaleDateString()}
                                    </p>
                                </CardHeader>
                                <CardContent className="p-5 flex-1 flex flex-col gap-4">
                                    <div className="flex items-center justify-between text-xs text-zinc-300">
                                        <span>{mealCount} meals</span>
                                    </div>
                                    <div className="flex -space-x-3 overflow-hidden mt-2">
                                        {Array.from({ length: previewSlots }).map((_, i) => (
                                            <div key={`slot-${plan.id}-${i}`} className="inline-flex h-10 w-10 items-center justify-center rounded-full border-2 border-zinc-900 bg-zinc-800 relative z-10" style={{ zIndex: 10 - i }}>
                                                <Utensils className="w-4 h-4 text-white/50" />
                                            </div>
                                        ))}
                                        {overflowCount > 0 && (
                                            <div className="inline-flex h-10 w-10 items-center justify-center rounded-full border-2 border-zinc-900 bg-zinc-800 text-[10px] font-bold text-white z-0">
                                                +{overflowCount}
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex gap-2 w-full mt-auto">
                                        <Button 
                                            variant="secondary" 
                                            className="flex-1 bg-primary/20 hover:bg-primary/40 text-primary-foreground border-none text-xs"
                                            onClick={() => setSelectedHistoryPlanId(plan.id)}
                                            disabled={isAnyMutationPending}
                                        >
                                            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                                            Restore
                                        </Button>
                                        <Button 
                                            variant="outline" 
                                            className="flex-1 border-white/10 hover:bg-white/5 text-white bg-transparent text-xs"
                                            onClick={() => setSelectedHistoryViewPlanId(plan.id)}
                                        >
                                            <Eye className="w-3.5 h-3.5 mr-1.5" />
                                            View
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
                {(hasMore || canShowLess) && (
                    <div className="mt-8 flex justify-center w-full gap-4">
                        {hasMore && (
                            <Button
                                variant="outline"
                                className="bg-zinc-900/50 border-white/10 hover:bg-white/5 text-zinc-300 font-medium text-xs uppercase tracking-wider px-6 py-2 min-h-11 min-w-11 rounded-full transition-all flex items-center justify-center gap-2"
                                onClick={handleShowMore}
                                disabled={isFetchingHistory}
                            >
                                {isFetchingHistory && historyOffset > 0 && <Loader2 className="w-4 h-4 animate-spin" />}
                                {isFetchingHistory && historyOffset > 0 ? "Loading..." : "Show more"}
                            </Button>
                        )}
                        {canShowLess && (
                            <Button
                                variant="outline"
                                className="bg-red-900/20 border-red-500/30 hover:bg-red-900/40 text-zinc-300 font-medium text-xs uppercase tracking-wider px-6 py-2 min-h-11 min-w-11 rounded-full transition-all"
                                onClick={handleShowLess}
                                disabled={isFetchingHistory}
                            >
                                Show less
                            </Button>
                        )}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="min-h-screen w-full relative bg-zinc-950 pb-20 overflow-x-hidden">
            {/* Background */}
            <div className="fixed inset-0 z-0 bg-zinc-950">
                <img src="/images/auth/login-bg.jpg" alt="BG" className="h-full w-full object-cover opacity-80 blur-[1px]" />
                <div className="absolute inset-0 bg-linear-to-br from-black/40 via-transparent to-black/60" />
            </div>

            <div className="container relative z-10 mx-auto px-4 md:px-8 py-6 max-w-400 space-y-6">
                {/* Header Section */}
                <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 relative z-50">
                    <div className="space-y-2">
                        <div className="inline-flex items-center gap-2 rounded-full bg-primary/20 px-3 py-0.5 text-[9px] md:text-[10px] font-black text-primary uppercase tracking-widest backdrop-blur-xl border border-primary/20">
                            <Calendar className="h-2.5 w-2.5" />
                            <span>Schedule</span>
                        </div>
                        <h1 className="text-3xl font-black tracking-tighter text-white sm:text-5xl uppercase italic leading-none drop-shadow-2xl">
                            Weekly Plan
                        </h1>
                    </div>
                    
                    {activePlan && !isCurrentlyGenerating && (
                        <div className="w-full md:w-auto flex flex-col sm:flex-row items-center gap-2 md:gap-3 p-1 bg-white/5 backdrop-blur-xl rounded-2xl md:rounded-3xl border border-white/10 shadow-2xl ring-1 ring-white/10">
                            <div className="w-full sm:w-auto grid grid-cols-3 md:flex md:flex-row items-center gap-px md:gap-3">
                                <select className="h-10 md:h-11 w-full md:w-auto px-1 md:px-4 bg-white/5 md:bg-transparent border-none text-white text-[10px] md:text-xs font-black uppercase tracking-widest rounded-l-xl md:rounded-2xl outline-none cursor-pointer hover:bg-white/10 transition-colors text-center md:text-left" value={currentRegenDays} onChange={(e) => setRegenDays(Number(e.target.value))}>
                                    {[1, 2, 3, 4, 5, 6, 7].map(d => <option key={d} value={d} className="bg-zinc-900">{d} Days</option>)}
                                </select>
                                <select className="h-10 md:h-11 w-full md:w-auto px-1 md:px-4 bg-white/5 md:bg-transparent border-none text-white text-[10px] md:text-xs font-black uppercase tracking-widest outline-none cursor-pointer hover:bg-white/10 transition-colors text-center md:text-left md:rounded-2xl" value={currentRegenMeals} onChange={(e) => setRegenMeals(e.target.value as MealsPerDay)}>
                                    <option value="1" className="bg-zinc-900">1 Meal</option>
                                    <option value="2" className="bg-zinc-900">2 Meals</option>
                                    <option value="3" className="bg-zinc-900">3 Meals</option>
                                </select>
                                <Button onClick={handleRegenerateFull} disabled={isAnyMutationPending} className="h-10 md:h-11 w-full md:w-auto px-1 md:px-6 rounded-r-xl md:rounded-2xl font-black text-[9px] md:text-[10px] uppercase tracking-widest bg-primary hover:bg-primary/90 shadow-none flex gap-1.5 justify-center">
                                    <RefreshCw className={cn("h-3 w-3", regenerateFullMutation.isPending && "animate-spin")} />
                                    <span className="hidden sm:inline">Regenerate</span>
                                    <span className="sm:hidden">Regen</span>
                                </Button>
                            </div>
                            <ShoppingListButton 
                                planId={activePlan.id} 
                                onCreateNew={() => setShowScopeSelector(true)} 
                                isGenerating={isAnyMutationPending || generateListMutation.isPending} 
                            />
                        </div>
                    )}
                </header>

                {(!activePlan || isCurrentlyGenerating) ? (
                    isCurrentlyGenerating ? (
                        <div className="flex flex-col gap-12 mt-10">
                            <GenerationProgress 
                                streamState={streamState} 
                                targetDays={activeStreamPlanId || activePlan ? currentRegenDays : days} 
                                isBackendBlocking={!activeStreamPlanId} 
                            />
                            {!activePlan && renderPastPlans(true)}
                        </div>
                    ) : (
                        <div className="flex flex-col gap-12 mt-10">
                            <Card className="max-w-md mx-auto border-none bg-white/5 backdrop-blur-3xl shadow-2xl rounded-[32px] ring-1 ring-white/10 overflow-hidden w-full">
                            <CardHeader className="text-center pt-10 pb-4">
                                <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center mx-auto mb-4 shadow-xl shadow-primary/20">
                                    <Sparkles className="w-8 h-8 text-white" />
                                </div>
                                <CardTitle className="text-2xl font-black uppercase italic tracking-tighter text-white">Start Planning</CardTitle>
                            </CardHeader>
                            <CardContent className="p-8 space-y-8">
                                <div className="grid gap-6 md:grid-cols-2 p-6 bg-black/20 rounded-[24px] border border-white/5">
                                    <div className="space-y-3">
                                        <div className="flex justify-between items-end">
                                            <label className="text-[9px] font-black uppercase text-white/60">Duration</label>
                                            <span className="text-white font-black text-xs uppercase tracking-tighter italic">{days} {days === 1 ? 'Day' : 'Days'}</span>
                                        </div>
                                        <input type="range" min="1" max="7" value={days} onChange={(e) => setDays(Number(e.target.value))} className="w-full accent-primary h-1.5 bg-white/10 rounded-full cursor-pointer" />
                                        <div className="flex justify-between px-0.5">
                                            {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                                                <span key={d} className={cn("text-[9px] font-black transition-all duration-300", days === d ? "text-white scale-125" : "text-white/40")}>
                                                    {d}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="space-y-3">
                                        <label className="text-[9px] font-black uppercase text-white/60 block">Meals</label>
                                        <select value={mealsPerDay} onChange={(e) => setMealsPerDay(e.target.value as MealsPerDay)} className="w-full h-10 px-3 bg-white/5 border border-white/10 text-white rounded-xl outline-none font-black text-sm uppercase">
                                            <option value="1" className="bg-zinc-900">1/day</option>
                                            <option value="2" className="bg-zinc-900">2/day</option>
                                            <option value="3" className="bg-zinc-900">3/day</option>
                                        </select>
                                    </div>
                                </div>
                                <Button onClick={handleGenerate} disabled={generateMutation.isPending} className="w-full h-14 text-base font-black bg-primary hover:bg-primary/90 rounded-2xl shadow-xl uppercase italic">
                                    {generateMutation.isPending ? <Loader2 className="h-6 w-6 animate-spin mr-2" /> : "Generate Master Plan"}
                                </Button>
                            </CardContent>
                        </Card>
                        {renderPastPlans(true)}
                    </div>
                )) : (
                    <div className="grid grid-cols-1 xl:grid-cols-5 gap-6 items-start">
                        <div className="xl:col-span-4 flex flex-col gap-10">
                            <div className="overflow-x-auto rounded-[24px] md:rounded-[40px] border border-white/10 shadow-[0_40px_80px_-15px_rgba(0,0,0,0.7)] bg-white/5 backdrop-blur-3xl ring-1 ring-white/10 scrollbar-thin scrollbar-thumb-primary/40 relative">
                            
                            {/* DYNAMIC CSS: Smoothly scaling Matrix grid with perfect alignment */}
                            <style dangerouslySetInnerHTML={{__html: `
                              .perfect-grid {
                                /* Mobile: Sidebar(80) + 2 Days visible. Gaps(2*1). ContainerPadding(32) */
                                grid-template-columns: 80px repeat(${activePlan.days.length || 1}, calc((100vw - 114px) / 2));
                              }
                              @media (min-width: 768px) {
                                /* Tablets: Sidebar(100) + 3 Days visible. Gaps(3*1). ContainerPadding(64) */
                                .perfect-grid {
                                  grid-template-columns: 100px repeat(${activePlan.days.length || 1}, calc((100vw - 167px) / 3));
                                }
                              }
                              @media (min-width: 1024px) {
                                /* Laptops: Sidebar(120) + 4 Days visible. Gaps(4*1). ContainerPadding(64) */
                                .perfect-grid {
                                  grid-template-columns: 120px repeat(${activePlan.days.length || 1}, calc((100vw - 188px) / 4));
                                }
                              }
                              @media (min-width: 1280px) {
                                /* Desktop: Sidebar(140) + 5 Days visible. Gaps(5*1). ContainerPadding(64) */
                                .perfect-grid {
                                  /* Note: Container max-width is 400 (custom large max) */
                                  grid-template-columns: 140px repeat(${activePlan.days.length || 1}, calc((100% - 145px) / 5));
                                }
                              }
                            `}} />
                            
                            <div className="grid gap-px bg-white/10 min-w-full perfect-grid">
                                <div className="bg-black/40 border-r border-white/5" />
                                {renderHeaderDays()}

                                {ALL_MEAL_TYPES.map((type) => (
                                    <div className="contents" key={type}>
                                        <div className="bg-black/30 flex flex-col items-center justify-center py-6 px-2 border-b border-white/5 gap-2">
                                            {type === 'breakfast' && <Coffee className="h-6 w-6 text-orange-400 drop-shadow-[0_0_8px_rgba(249,115,22,0.4)]" />}
                                            {type === 'lunch' && <Utensils className="h-6 w-6 text-sky-400 drop-shadow-[0_0_8px_rgba(56,189,248,0.4)]" />}
                                            {type === 'dinner' && <Moon className="h-6 w-6 text-indigo-400 drop-shadow-[0_0_8px_rgba(129,140,248,0.4)]" />}
                                            <span className="capitalize text-[11px] md:text-sm font-black tracking-widest text-white/80 leading-none">
                                                {type}
                                            </span>
                                        </div>

                                        {activePlan.days.map((day) => {
                                            const meal = day.meals.find(m => m.mealType === type);
                                            
                                            // Check if THIS specific meal is being swapped (by user or AI)
                                            const isMealSwapping = activeSwaps.some(s => s?.dayNumber === day.dayNumber && s?.mealType === type);
                                            // Check if THIS specific day is being regenerated (by user or AI)
                                            const isDayRegenerating = activeDayRegens.some(r => r?.dayNumber === day.dayNumber);

                                            const isRegenerating = isMealSwapping || isDayRegenerating;

                                            return (
                                                <div key={`${day.id}-${type}`} className="bg-transparent p-1.5 md:p-3 group border-b border-white/5">                                                    {meal ? (
                                                        <div className={cn(
                                                            "relative h-full transition-all duration-500 rounded-4xl md:rounded-2xl overflow-hidden",
                                                            isRegenerating && "opacity-50 scale-[0.98] blur-[1px] pointer-events-none"
                                                        )}>
                                                            <Link href={`/meals/${meal.id}`} className="block h-full">
                                                                <div className="h-full min-h-25 md:min-h-27.5 bg-white border border-white rounded-4xl md:rounded-2xl p-3 md:p-5 hover:scale-[1.02] hover:shadow-2xl transition-all group flex flex-col justify-start relative overflow-hidden">
                                                                    {meal.imageUrl ? (
                                                                        <div className="absolute inset-0 z-0">
                                                                            <img
                                                                                src={meal.imageUrl}
                                                                                alt={meal.recipeName}
                                                                                className="h-full w-full object-cover opacity-30 transition-opacity duration-500 group-hover:opacity-50"
                                                                                onError={(e) => {
                                                                                    e.currentTarget.onerror = null;
                                                                                    e.currentTarget.src = "/images/auth/login-bg.jpg";
                                                                                }}
                                                                            />
                                                                            <div className="absolute inset-0 bg-linear-to-t from-white via-white/85 to-white/40" />
                                                                        </div>
                                                                    ) : (
                                                                        <div className="absolute inset-0 z-0 bg-zinc-100 flex items-center justify-center opacity-50">
                                                                            <Utensils className="h-8 w-8 text-zinc-300" />
                                                                        </div>
                                                                    )}
                                                                    <p className="font-black text-[10px] md:text-[13px] leading-tight text-zinc-900 tracking-tight line-clamp-3 uppercase italic z-10 pr-5 md:pr-6 mb-1.5 md:mb-2">
                                                                        {meal.recipeName}
                                                                    </p>
                                                                    <div className="flex z-10 w-full mb-auto">
                                                                        <div className="flex items-center text-[7px] md:text-[8px] font-black text-primary uppercase tracking-widest bg-white/70 backdrop-blur-sm md:bg-transparent md:backdrop-blur-none px-1.5 py-0.5 md:px-0 md:py-0 rounded-md">
                                                                            <Clock className="w-2.5 h-2.5 md:w-3 md:h-3 mr-1" />
                                                                            {meal.cookTimeMinutes}m
                                                                        </div>
                                                                    </div>
                                                                    <div className="h-5 md:h-6 w-full shrink-0" /> {/* Spacer for absolute stars on bottom left */}
                                                                </div>
                                                            </Link>
                                                            
                                                            {isRegenerating && (
                                                                <div className="absolute inset-0 flex items-center justify-center z-30">
                                                                    <RefreshCw className="h-5 w-5 md:h-8 md:w-8 animate-spin text-primary" />
                                                                </div>
                                                            )}

                                                            <StarRating 
                                                                recipeName={meal.recipeName}
                                                                currentRating={ratingsData?.[meal.recipeName.toLowerCase()] || 0}
                                                                onRate={(rating) => rateMutation.mutate({ recipeName: meal.recipeName, rating })}
                                                                disabled={rateMutation.isPending}
                                                                className="absolute bottom-3 left-3 md:bottom-5 md:left-5 z-20 flex gap-px md:gap-0.5 bg-white/70 md:bg-transparent backdrop-blur-sm md:backdrop-blur-none px-1.5 py-1 md:px-0 md:py-0 rounded-md shadow-sm md:shadow-none"
                                                            />

                                                            <Button 
                                                                variant="ghost" size="icon" 
                                                                title="Swap Meal"
                                                                className="absolute top-1.5 right-1.5 h-6 w-6 md:h-8 md:w-8 rounded-full bg-white/90 backdrop-blur-sm border border-zinc-100 text-zinc-400 opacity-100 md:opacity-0 md:group-hover:opacity-100 shadow-md hover:bg-zinc-900 hover:text-white transition-all z-20"
                                                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); swapMealMutation.mutate({ dayNumber: day.dayNumber, mealType: type }); }}
                                                                disabled={isAnyMutationPending}
                                                            >
                                                                <RefreshCw className="h-3 w-3" />
                                                            </Button>
                                                        </div>
                                                    ) : (
                                                        <div className={cn(
                                                            "h-full min-h-25 border border-dashed border-white/10 rounded-4xl bg-white/5 flex flex-col items-center justify-center gap-2 italic transition-all relative",
                                                            isRegenerating ? "opacity-20" : "opacity-40"
                                                        )}>
                                                            <span className="text-[7px] md:text-[8px] font-black uppercase tracking-widest text-white/40">Empty</span>
                                                            {isRegenerating && <RefreshCw className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-primary z-30" />}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                ))}

                                {['snack', 'evening'].map((type) => (
                                    <div className="contents" key={type}>
                                        <div className="bg-black/40 flex flex-col items-center justify-center py-4 border-b border-white/5 gap-1.5">
                                            {type === 'snack' ? <Cookie className="h-5 w-5 text-amber-500 opacity-80" /> : <GlassWater className="h-5 w-5 text-blue-400 opacity-80" />}
                                            <span className="capitalize text-[10px] font-black tracking-widest text-white/80 leading-none">{type}</span>
                                        </div>
                                        {activePlan.days.map((day) => (
                                            <div key={`${day.id}-${type}`} className="bg-transparent p-1.5 md:p-3 opacity-30 border-b border-white/5">
                                                <div className="h-full rounded-xl border border-dashed border-white/40 bg-white/10 flex items-center justify-center min-h-10 md:min-h-12.5 gap-1 shadow-inner">
                                                    <span className="text-[7px] md:text-[8px] font-black uppercase tracking-widest text-white/80">Coming soon</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ))}
                            </div>
                        </div>

                        {loadedHistoryPlans && loadedHistoryPlans.length > 0 && (
                            <div className="w-full">
                                {renderPastPlans(false)}
                            </div>
                        )}
                    </div>

                    <div className="xl:col-span-1 bg-white/5 backdrop-blur-3xl rounded-[32px] md:rounded-[40px] border border-white/10 shadow-[0_40px_80px_-15px_rgba(0,0,0,0.7)] overflow-hidden sticky top-6 md:top-10">
                            <div className="p-6 border-b border-white/5 bg-white/2">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-lg font-black uppercase italic text-white flex items-center gap-2 tracking-tighter">
                                        <LayoutDashboard className="w-4 h-4 text-primary" />
                                        Library
                                    </h3>
                                    <Badge variant="secondary" className="bg-primary/20 text-white border-none text-[9px] font-black uppercase px-2 py-0.5 shadow-lg">
                                        {activePlan.days.flatMap(d => d.meals).length} Meals
                                    </Badge>
                                </div>
                            </div>
                            <div className="p-4 max-h-[calc(100vh-250px)] overflow-y-auto space-y-3 no-scrollbar">
                                {activePlan.days.flatMap(d => d.meals).map((meal) => (
                                    <Link key={meal.id} href={`/meals/${meal.id}`} className="block group">
                                        <div className="relative aspect-16/10 rounded-xl overflow-hidden border border-white/10 bg-white hover:scale-[1.02] transition-all shadow-xl">
                                            {meal.imageUrl ? (
                                                <img
                                                    src={meal.imageUrl}
                                                    alt={meal.recipeName}
                                                    className="absolute inset-0 h-full w-full object-cover opacity-30 group-hover:opacity-50 transition-all duration-700"
                                                    onError={(e) => {
                                                        e.currentTarget.onerror = null;
                                                        e.currentTarget.src = "/images/auth/login-bg.jpg";
                                                    }}
                                                />
                                            ) : (
                                                <div className="absolute inset-0 flex items-center justify-center bg-zinc-100 opacity-50">
                                                    <Utensils className="h-6 w-6 text-zinc-300" />
                                                </div>
                                            )}
                                            <div className="absolute inset-0 bg-linear-to-t from-white via-white/80 to-white/40" />
                                            <div className="absolute inset-0 p-3 flex flex-col justify-between">
                                                <Badge className="w-fit bg-primary/10 text-primary border-none text-[8px] font-black uppercase tracking-widest px-1.5 py-0 shadow-sm">{meal.mealType}</Badge>
                                                <p className="font-black text-[10px] leading-tight text-zinc-900 tracking-tight line-clamp-2 uppercase italic drop-shadow-sm">{meal.recipeName}</p>
                                            </div>
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        </div>
                    </div>

                )}
            </div>

            {/* Restore Confirmation Modal */}
            {selectedHistoryPlanId && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                    <Card className="max-w-md w-full bg-zinc-950 border-white/10 shadow-2xl">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-white">
                                <History className="w-5 h-5 text-primary" />
                                Restore Plan
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <p className="text-zinc-400 text-sm leading-relaxed">
                                Are you sure you want to replace your current active plan with this past plan? 
                                Your current plan will be moved to history.
                            </p>
                            <div className="flex gap-3 justify-end pt-2">
                                <Button variant="outline" onClick={() => setSelectedHistoryPlanId(null)} className="border-white/10 text-white bg-transparent hover:bg-white/5">Cancel</Button>
                                <Button onClick={handleRestoreConfirm} disabled={restorePlanMutation.isPending} className="bg-primary hover:bg-primary/90 text-primary-foreground">
                                    {restorePlanMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Yes, Replace Plan"}
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Allergen Warning Modal */}
            {allergenWarningPlanId && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                    <Card className="max-w-md w-full bg-zinc-950 border-amber-500/30 shadow-2xl shadow-amber-900/20">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-amber-500">
                                <AlertTriangle className="w-5 h-5" />
                                Allergen Warning
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="bg-amber-500/10 border border-amber-500/20 p-4 rounded-lg">
                                <p className="text-amber-200/90 text-sm leading-relaxed whitespace-pre-line">
                                    {conflictingMealSummary}
                                </p>
                            </div>
                            <p className="text-zinc-400 text-sm">
                                Since this plan was created, your household's allergen profile has changed. 
                                Are you sure you still want to restore this plan?
                            </p>
                            <div className="flex gap-3 justify-end pt-2">
                                <Button variant="outline" onClick={() => setAllergenWarningPlanId(null)} className="border-white/10 text-white bg-transparent hover:bg-white/5">Cancel</Button>
                                <Button onClick={handleAllergenConfirm} disabled={restorePlanMutation.isPending} className="bg-amber-600 hover:bg-amber-700 text-white">
                                    {restorePlanMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "I accept the risk"}
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Archived Plan View Modal */}
            {isDesktop ? (
                <Dialog open={!!selectedHistoryViewPlanId} onOpenChange={(open) => !open && setSelectedHistoryViewPlanId(null)}>
                    <DialogContent className="bg-zinc-950 border-white/10 text-white sm:max-w-md max-h-[85vh] flex flex-col">
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2 text-xl font-black italic uppercase">
                                <History className="w-5 h-5 text-primary" />
                                Archived Plan
                            </DialogTitle>
                            <DialogDescription className="text-zinc-400 sr-only">
                                View details of this archived plan.
                            </DialogDescription>
                        </DialogHeader>
                        <ViewContent />
                    </DialogContent>
                </Dialog>
            ) : (
                <Sheet open={!!selectedHistoryViewPlanId} onOpenChange={(open) => !open && setSelectedHistoryViewPlanId(null)}>
                    <SheetContent side="bottom" className="bg-zinc-950 border-t-white/10 text-white rounded-t-[32px] max-h-[85vh] flex flex-col gap-0 px-4 pt-6 pb-8">
                        <SheetHeader className="pb-4 text-left">
                            <SheetTitle className="flex items-center gap-2 text-xl font-black italic uppercase text-white">
                                <History className="w-5 h-5 text-primary" />
                                Archived Plan
                            </SheetTitle>
                            <SheetDescription className="text-zinc-400 sr-only">
                                View details of this archived plan.
                            </SheetDescription>
                        </SheetHeader>
                        <ViewContent />
                    </SheetContent>
                </Sheet>
            )}

            {/* Scope Selector for Shopping List */}
            {isDesktop ? (
                <Dialog open={showScopeSelector} onOpenChange={setShowScopeSelector}>
                    <DialogContent className="bg-zinc-950/90 backdrop-blur-2xl border-white/10 text-white sm:max-w-xl max-h-[85vh] flex flex-col rounded-3xl shadow-2xl p-6 md:p-8">
                        <DialogHeader className="pb-4 border-b border-white/5 space-y-3">
                            <DialogTitle className="flex items-center gap-2 text-2xl font-black italic uppercase tracking-tighter text-white drop-shadow-md">
                                <Utensils className="w-6 h-6 text-emerald-400" />
                                Create Shopping List
                            </DialogTitle>
                            <DialogDescription className="text-sm font-medium text-zinc-400">
                                Choose which meals and days to include in your shopping list.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="flex-1 overflow-y-auto no-scrollbar pt-2 pr-2">
                            {renderScopeSelectorContent()}
                        </div>
                    </DialogContent>
                </Dialog>
            ) : (
                <Sheet open={showScopeSelector} onOpenChange={setShowScopeSelector}>
                    <SheetContent side="bottom" className="bg-zinc-950/95 backdrop-blur-2xl border-t-white/10 text-white rounded-t-[32px] max-h-[85vh] flex flex-col gap-0 px-4 pt-6 pb-8 shadow-2xl">
                        <SheetHeader className="pb-5 border-b border-white/5 mb-2 text-left space-y-2">
                            <SheetTitle className="flex items-center gap-2 text-2xl font-black italic uppercase tracking-tighter text-white">
                                <Utensils className="w-6 h-6 text-emerald-400" />
                                Create Shopping List
                            </SheetTitle>
                            <SheetDescription className="text-sm font-medium text-zinc-400">
                                Choose which meals and days to include in your shopping list.
                            </SheetDescription>
                        </SheetHeader>
                        <div className="flex-1 overflow-y-auto no-scrollbar pt-2">
                            {renderScopeSelectorContent()}
                        </div>
                    </SheetContent>
                </Sheet>
            )}
        </div>
    );
}
