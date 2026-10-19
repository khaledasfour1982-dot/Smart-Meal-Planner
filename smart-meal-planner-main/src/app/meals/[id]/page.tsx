"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "~/trpc/react";
import { INSTRUCTIONS_PLACEHOLDER } from "~/server/ai/types";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import {
    ChevronLeft,
    Clock,
    Utensils,
    ChefHat,
    ShoppingBasket,
    Loader2,
    AlertCircle,
    Info,
    Euro
} from "lucide-react";
import Link from "next/link";
import { StarRating } from "~/components/meal/StarRating";
import { QuickTimeButton } from "src/components/meal/QuickTimeButton";

interface Ingredient {
    name: string;
    quantity: number | string;
    unit: string;
    category: string;
    estPriceEuro?: number;
}

export default function RecipeDetailPage() {
    const params = useParams();
    const router = useRouter();
    const id = params.id as string;

    const { data: meal, isLoading: mealLoading, error } = api.meals.getById.useQuery({ id }, {
        retry: false,
    });

    const { data: profile, isLoading: profileLoading } = api.household.get.useQuery();

    const needsDetailFetch = meal?.instructions === INSTRUCTIONS_PLACEHOLDER;
    const { data: recipeDetail, isLoading: instructionsQueryLoading } = api.meals.getRecipeDetail.useQuery(
        { mealId: meal?.id ?? "" },
        { enabled: !!meal?.id && needsDetailFetch }
    );
    const instructionsLoading = needsDetailFetch && instructionsQueryLoading;

    const { data: ratingsData = {} } = api.feedback.getForPlan.useQuery(
        { recipeNames: meal ? [meal.recipeName] : [] },
        { enabled: !!meal?.recipeName }
    );

    const apiUtils = api.useUtils();
    const rateMutation = api.feedback.rate.useMutation({
        onMutate: async (newRating) => {
            if (!meal) return;
            await apiUtils.feedback.getForPlan.cancel();
            const previousRatings = apiUtils.feedback.getForPlan.getData({ recipeNames: [meal.recipeName] });
            if (previousRatings) {
                apiUtils.feedback.getForPlan.setData(
                    { recipeNames: [meal.recipeName] },
                    { ...previousRatings, [newRating.recipeName.toLowerCase()]: newRating.rating }
                );
            }
            return { previousRatings };
        },
        onError: (err, newRating, context) => {
            if (context?.previousRatings && meal) {
                apiUtils.feedback.getForPlan.setData(
                    { recipeNames: [meal.recipeName] },
                    context.previousRatings
                );
            }
        },
        onSettled: async () => {
            await apiUtils.feedback.getForPlan.invalidate();
        }
    });

    const generateListMutation = api.shoppingList.generateList.useMutation({
        onSuccess: (list) => {
            router.push(`/shopping-list/${list.id}`);
        },
        onError: (err) => {
            console.error("Failed to generate shopping list:", err);
            // Optionally could add a toast here, but bare minimum is console logs
        },
    });

    const { data: existingLists } = api.shoppingList.getLists.useQuery(undefined, {
        enabled: !!meal?.id,
    });
    const existingList = React.useMemo(() => {
        if (!existingLists || !meal) return null;
        return existingLists.find((l) => l.scope === "meal" && l.scopeId === meal.id);
    }, [existingLists, meal]);

    const { data: estimatedCost } = api.meals.estimatedCost.useQuery(
        { mealId: meal?.id ?? "" },
        { enabled: !!meal?.id }
    ) || { data: undefined };

    if (mealLoading || profileLoading) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-background">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
            </div>
        );
    }

    if (error || !meal) {
        return (
            <div className="flex min-h-screen flex-col items-center justify-center text-center p-4">
                <AlertCircle className="h-16 w-16 text-destructive mb-6" />
                <h1 className="text-3xl font-black tracking-tight mb-2">Recipe Not Found</h1>
                <p className="text-muted-foreground max-w-sm mb-8">
                    We couldn't find this recipe in your database. Please check the URL or try generating a new plan.
                </p>
                <Button asChild size="lg" className="rounded-full px-8 font-bold">
                    <Link href="/dashboard">Back to Dashboard</Link>
                </Button>
            </div>
        );
    }

    const fallbackUrl = "/images/auth/login-bg.jpg";

    const totalCost = typeof estimatedCost === "number" ? estimatedCost : 0;

    const rawIngredients = (meal.ingredients as unknown as Ingredient[]) || [];
    const ingredients = rawIngredients.filter(ing => ing.name);

    const rawInstructions = needsDetailFetch ? recipeDetail?.instructions : meal.instructions;
    const finalInstructions = rawInstructions && rawInstructions !== INSTRUCTIONS_PLACEHOLDER ? rawInstructions : "";

    const instructionSteps = finalInstructions
        .split(/\d+\. |\.\s+| then | and then /i)
        .map(s => s.trim())
        .filter(s => s.length > 3);

    return (
        <div className="min-h-screen bg-background pb-12">
            <div className="relative h-64 w-full md:h-80 lg:h-112.5 overflow-hidden bg-zinc-900 flex items-center justify-center">
                {meal.imageUrl ? (
                    <img
                        src={meal.imageUrl}
                        alt={meal.recipeName}
                        className="absolute inset-0 h-full w-full object-cover opacity-90 transition-opacity duration-700"
                        onError={(e) => {
                            e.currentTarget.onerror = null;
                            e.currentTarget.src = fallbackUrl;
                        }}
                    />
                ) : (
                    <div className="absolute inset-0 bg-muted/30 flex items-center justify-center">
                        <Utensils className="h-24 w-24 text-muted-foreground/30" />
                    </div>
                )}
                <div className="absolute inset-0 bg-linear-to-t from-black via-black/30 to-transparent" />

                <div className="absolute inset-0 flex items-end justify-start p-6 pb-18 md:p-12 md:pb-12">
                    <div className="container mx-auto max-w-5xl">
                        <div className="mb-1.5 inline-flex items-center gap-2 rounded-full bg-black px-4 py-1.5 text-[10px] font-black text-white uppercase tracking-[0.2em] shadow-2xl ring-1 ring-white/10 backdrop-blur-md">
                            <ChefHat className="h-3.5 w-3.5 text-white" />
                            <span>Personalized Selection</span>
                        </div>
                        <h1 className="max-w-2xl text-3xl font-black tracking-tighter text-white drop-shadow-2xl sm:text-5xl md:text-7xl leading-[0.9]">
                            {meal.recipeName}
                        </h1>
                        <div className="mt-2 flex items-center">
                            <StarRating
                                recipeName={meal.recipeName}
                                currentRating={ratingsData?.[meal.recipeName.toLowerCase()] || 0}
                                onRate={(rating) => rateMutation.mutate({ recipeName: meal.recipeName, rating })}
                                disabled={rateMutation.isPending}
                                className="scale-110 md:scale-125 origin-left backdrop-blur-md bg-black/40 p-2 rounded-xl ring-1 ring-white/10"
                            />
                        </div>
                    </div>
                </div>

                <div className="absolute left-4 top-4 z-30 md:left-8 md:top-8">
                    <Button
                        variant="outline"
                        size="icon"
                        className="h-10 w-10 rounded-full border-none bg-black text-white shadow-2xl transition-all hover:scale-110 active:scale-95 ring-1 ring-white/10 backdrop-blur-md"
                        onClick={() => router.back()}
                    >
                        <ChevronLeft className="h-6 w-6 stroke-[3px]" />
                    </Button>
                </div>
            </div>

            <div className="container mx-auto -mt-10 max-w-5xl px-4 relative z-20">
                <div className="grid gap-8 lg:grid-cols-3">

                    <div className="space-y-8 lg:col-span-2">
                        <div className="flex items-center justify-between gap-2 overflow-x-auto rounded-[32px] border bg-card p-3 md:p-5 shadow-2xl no-scrollbar ring-1 ring-black/5">
                            <div className="flex flex-col items-center flex-1 min-w-20">
                                <Clock className="h-4 w-4 md:h-5 md:w-5 text-primary mb-1" />
                                <span className="text-[9px] md:text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">Time</span>
                                <span className="text-sm md:text-base font-black">{meal.cookTimeMinutes}m</span>
                                <div className="mt-1 md:mt-2">
                                    <QuickTimeButton
                                        mealId={meal.id}
                                        currentCookTime={meal.cookTimeMinutes}
                                        onSimplified={() => void apiUtils.meals.getById.invalidate({ id })}
                                    />
                                </div>
                            </div>
                            <div className="h-8 md:h-10 w-px bg-border shrink-0" />
                            <div className="flex flex-col items-center flex-1 min-w-20">
                                <Utensils className="h-4 w-4 md:h-5 md:w-5 text-foreground mb-1" />
                                <span className="text-[9px] md:text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">Type</span>
                                <span className="text-sm md:text-base font-black capitalize">{meal.mealType}</span>
                            </div>
                            <div className="h-8 md:h-10 w-px bg-border shrink-0" />
                            <div className="flex flex-col items-center flex-1 min-w-20">
                                <Euro className="h-4 w-4 md:h-5 md:w-5 text-emerald-500 mb-1" />
                                <span className="text-[9px] md:text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">Budget</span>
                                <span className="text-sm md:text-base font-black">€{totalCost.toFixed(2)}</span>
                            </div>
                        </div>

                        <section className="space-y-6">
                            <div className="flex items-center gap-4">
                                <h2 className="text-3xl font-black tracking-tighter uppercase italic">Preparation</h2>
                                <div className="h-1 flex-1 bg-linear-to-r from-primary to-transparent rounded-full opacity-20" />
                            </div>
                            <div className="space-y-6">
                                {instructionsLoading ? (
                                    Array.from({ length: 3 }).map((_, i) => (
                                        <div key={i} className="group relative flex items-start gap-6 rounded-[28px] border border-transparent bg-card p-6 shadow-sm animate-pulse">
                                            <span className="flex h-10 w-10 shrink-0 rounded-xl bg-primary/20"></span>
                                            <div className="flex-1 space-y-4 py-1">
                                                <div className="h-4 w-3/4 rounded bg-muted"></div>
                                                <div className="h-4 w-1/2 rounded bg-muted"></div>
                                            </div>
                                        </div>
                                    ))
                                ) : instructionSteps.length > 0 ? (
                                    instructionSteps.map((step, index) => (
                                        <div key={index} className="group relative flex items-start gap-6 rounded-[28px] border border-transparent bg-card p-6 shadow-sm transition-all hover:shadow-xl hover:border-primary/10">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-lg font-black text-primary-foreground shadow-lg shadow-primary/20 transition-transform group-hover:rotate-3">
                        {index + 1}
                      </span>
                                            <p className="mt-1 text-lg leading-relaxed text-foreground/80 font-medium">
                                                {step}
                                            </p>
                                        </div>
                                    ))
                                ) : (
                                    <div className="p-8 text-center bg-muted/20 rounded-3xl border-dashed border-2">
                                        <p className="text-muted-foreground italic">AI-generated instructions loading...</p>
                                    </div>
                                )}
                            </div>
                        </section>
                    </div>

                    <div className="space-y-8">
                        <Card className="overflow-hidden border-none shadow-2xl rounded-[40px] bg-card">
                            <CardHeader className="bg-zinc-900 pb-12 pt-10 text-white text-center">
                                <CardTitle className="flex flex-col items-center gap-4 text-2xl font-black tracking-tight">
                                    <div className="bg-white/10 p-3 rounded-2xl backdrop-blur-md border border-white/10">
                                        <ShoppingBasket className="h-7 w-7" />
                                    </div>
                                    Ingredients
                                </CardTitle>
                                <div className="mt-2 flex flex-col items-center gap-2">
                                    {estimatedCost != null && (
                                        <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 px-3 py-1 text-[10px] font-black text-emerald-400 uppercase tracking-widest border border-emerald-500/20">
                                            <Euro className="h-3 w-3" />
                                            <span>~€{estimatedCost.toFixed(2)} estimated cost</span>
                                        </div>
                                    )}
                                    {profile && (
                                        <div className="inline-flex items-center gap-1.5 rounded-full bg-primary/20 px-3 py-1 text-[10px] font-black text-primary-foreground uppercase tracking-widest border border-primary/20">
                                            <Utensils className="h-3 w-3" />
                                            <span>Scaled for: {[
                                                profile.adults > 0 ? `${profile.adults} Adult${profile.adults > 1 ? 's' : ''}` : null,
                                                profile.children > 0 ? `${profile.children} Child${profile.children > 1 ? 'ren' : ''}` : null,
                                                profile.toddlers > 0 ? `${profile.toddlers} Toddler${profile.toddlers > 1 ? 's' : ''}` : null
                                            ].filter(Boolean).join(', ')}</span>
                                        </div>
                                    )}
                                </div>
                            </CardHeader>
                            <CardContent className="-mt-8 rounded-t-[40px] bg-card pt-10 px-8">
                                <div className="space-y-6">
                                    {ingredients.length > 0 ? (
                                        ingredients.map((ing, idx) => (
                                            <div key={idx} className="flex items-center justify-between border-b border-border/20 pb-4 last:border-0">
                                                <div className="flex flex-col gap-0.5">
                                                    <span className="font-bold text-lg text-foreground tracking-tight">{ing.name}</span>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/50">{ing.category}</span>
                                                        {typeof ing.estPriceEuro === 'number' && (
                                                            <span className="text-[10px] font-medium text-emerald-600 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                                                                ~€{ing.estPriceEuro.toFixed(2)}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                                <Badge variant="secondary" className="font-black text-xs bg-primary/5 text-primary border-none px-3 py-1">
                                                    {ing.quantity} {ing.unit}
                                                </Badge>
                                            </div>
                                        ))
                                    ) : (
                                        <p className="text-center text-sm text-muted-foreground">Ingredients loading...</p>
                                    )}
                                </div>
                                <Button 
                                    className="mt-10 w-full h-14 rounded-2xl text-base font-black shadow-2xl shadow-primary/30 group active:scale-95 transition-all bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:active:scale-100 uppercase" 
                                    variant="default"
                                    onClick={() => {
                                        if (!meal) return;
                                        if (existingList) {
                                            router.push(`/shopping-list/${existingList.id}`);
                                            return;
                                        }
                                        generateListMutation.mutate({ 
                                            scope: "meal", 
                                            scopeId: meal.id,
                                            name: `${meal.recipeName} List` 
                                        });
                                    }}
                                    disabled={generateListMutation.isPending}
                                >
                                    {generateListMutation.isPending ? (
                                        <>
                                            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                                            GENERATING...
                                        </>
                                    ) : existingList ? (
                                        "View Shopping List"
                                    ) : (
                                        "Add to Shopping List"
                                    )}
                                </Button>
                            </CardContent>
                        </Card>

                        <div className="bg-primary/5 border border-primary/10 rounded-[32px] p-8 flex flex-col gap-4">
                            <div className="flex items-center gap-3 text-primary">
                                <Info className="h-6 w-6" />
                                <h3 className="font-black text-lg uppercase tracking-tight">AI Note</h3>
                            </div>
                            <p className="text-sm text-muted-foreground leading-relaxed font-medium italic">
                                Quantities are automatically scaled based on your household size. Prices are estimates based on local Belgian markets.
                            </p>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
}
