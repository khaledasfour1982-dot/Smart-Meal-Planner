"use client";

import { useSession } from "next-auth/react";
import { api } from "~/trpc/react";
import { 
    ChefHat, 
    Calendar, 
    Users, 
    TrendingUp, 
    ArrowRight, 
    Clock, 
    Utensils, 
    ShoppingCart, 
    Sparkles,
    Loader2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import Link from "next/link";

function generatePixabayUrl(recipeName: string): string {
    const cleanQuery = recipeName
        .toLowerCase()
        .replace(/[^\w\s]/g, '')
        .trim()
        .split(/\s+/)
        .slice(0, 4)
        .join('-');
    return `https://pixabay.com/images/search/recipe-${cleanQuery}/`;
}

export default function DashboardPage() {
    const { data: session } = useSession();
    const { data: profile, isLoading: profileLoading } = api.household.get.useQuery();
    const { data: activePlan, isLoading: planLoading } = api.plans.getActivePlan.useQuery();

    const isLoading = profileLoading || planLoading;

    if (isLoading) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-zinc-950">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
            </div>
        );
    }

    // Intelligent "Up Next" logic based on time of day
    const currentHour = new Date().getHours();
    let targetType: "breakfast" | "lunch" | "dinner" = "breakfast";
    let targetDayOffset = 0;

    if (currentHour >= 5 && currentHour < 11) {
        targetType = "breakfast";
    } else if (currentHour >= 11 && currentHour < 16) {
        targetType = "lunch";
    } else if (currentHour >= 16 && currentHour < 22) {
        targetType = "dinner";
    } else {
        // Late night: Show tomorrow's breakfast
        targetType = "breakfast";
        targetDayOffset = 1;
    }

    const nextMeal = activePlan?.days[targetDayOffset]?.meals.find(m => m.mealType === targetType) 
                  ?? activePlan?.days[0]?.meals[0]; // Fallback to first available

    const totalDays = activePlan?.days.length ?? 0;
    const startDate = activePlan?.startDate ? new Date(activePlan.startDate) : null;
    let currentDay = 0;
    
    if (startDate && totalDays > 0) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const planStart = new Date(startDate);
        planStart.setHours(0, 0, 0, 0);
        const diffTime = today.getTime() - planStart.getTime();
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        currentDay = Math.min(Math.max(diffDays + 1, 1), totalDays);
    }
    
    return (
        <div className="min-h-screen w-full relative bg-background pb-32 overflow-x-hidden">
            {/* Hero Header - Increased height and fixed z-index overlap */}
            <div className="relative h-[450px] w-full overflow-hidden bg-zinc-950">
                <img src="/images/auth/login-bg.jpg" alt="BG" className="h-full w-full object-cover opacity-80" />
                <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-black/40" />
                
                <div className="absolute inset-0 flex items-center justify-start px-6 md:px-12 text-zinc-900 dark:text-zinc-100 z-20">
                    <div className="container mx-auto max-w-6xl pb-24 md:pb-32">
                        <div className="inline-flex items-center gap-2 rounded-full bg-black px-5 py-2 text-[10px] font-black text-white uppercase tracking-[0.2em] shadow-2xl ring-1 ring-white/20 mb-6 backdrop-blur-md">
                            <Sparkles className="h-4 w-4" />
                            <span>Executive Command Center</span>
                        </div>
                        <h1 className="text-3xl md:text-8xl font-black tracking-tighter text-white uppercase italic drop-shadow-2xl leading-[0.9]">
                            Welcome, <br/> <span className="text-primary">Chef {session?.user?.name?.split(' ')[0]}</span>
                        </h1>
                    </div>
                </div>
            </div>

            <div className="container relative z-30 mx-auto px-4 md:px-8 -mt-32 max-w-6xl space-y-10">
                <div className="grid gap-8 lg:grid-cols-3">
                    {/* Next Meal Spotlight */}
                    <Card className="lg:col-span-2 border-none shadow-2xl rounded-[40px] bg-white dark:bg-zinc-900 overflow-hidden group">
                        <div className="relative h-full flex flex-col">
                            <CardHeader className="p-8 md:p-12 pb-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 rounded-xl bg-primary/10 text-primary">
                                            <Utensils className="w-5 h-5" />
                                        </div>
                                        <CardTitle className="text-2xl font-black uppercase italic tracking-tighter text-zinc-900 dark:text-white">Up Next on the Menu</CardTitle>
                                    </div>
                                    <Badge className="bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white border-none px-3 py-1 font-black text-[9px] uppercase tracking-widest">Today</Badge>
                                </div>
                            </CardHeader>
                            <CardContent className="p-8 md:p-12 pt-4 flex-1">
                                {nextMeal ? (
                                    <div className="relative rounded-[32px] overflow-hidden bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-100 dark:border-white/5 p-8 md:p-10 group/meal">
                                        <div className="flex flex-col md:flex-row gap-8 items-center text-zinc-900 dark:text-zinc-100">
                                            <div className="relative w-full md:w-48 aspect-square rounded-2xl overflow-hidden shadow-2xl shrink-0 bg-zinc-100 flex items-center justify-center">
                                                {nextMeal.imageUrl ? (
                                                    <img
                                                        src={nextMeal.imageUrl}
                                                        alt="Meal"
                                                        className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover/meal:scale-110"
                                                        onError={(e) => {
                                                            e.currentTarget.onerror = null;
                                                            e.currentTarget.src = "/images/auth/login-bg.jpg";
                                                        }}
                                                    />
                                                ) : (
                                                    <Utensils className="h-10 w-10 text-zinc-300" />
                                                )}
                                                <div className="absolute inset-0 bg-black/20" />
                                            </div>
                                            <div className="flex-1 space-y-4 text-center md:text-left">
                                                <Badge className="bg-primary text-white border-none text-[10px] font-black uppercase tracking-widest px-3">{nextMeal.mealType}</Badge>
                                                <h3 className="text-3xl md:text-4xl font-black tracking-tighter uppercase italic leading-tight">{nextMeal.recipeName}</h3>
                                                <div className="flex items-center justify-center md:justify-start gap-6 text-muted-foreground">
                                                    <div className="flex items-center gap-2">
                                                        <Clock className="w-4 h-4 text-primary" />
                                                        <span className="text-xs font-bold uppercase tracking-widest">{nextMeal.cookTimeMinutes} Mins</span>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <Users className="w-4 h-4 text-primary" />
                                                        <span className="text-xs font-bold uppercase tracking-widest">Household Scaled</span>
                                                    </div>
                                                </div>
                                                <Button asChild className="rounded-xl h-12 px-8 font-black uppercase tracking-widest shadow-lg hover:scale-105 transition-all bg-zinc-950 text-white dark:bg-white dark:text-black">
                                                    <Link href={`/meals/${nextMeal.id}`}>VIEW RECIPE <ArrowRight className="ml-2 w-4 h-4" /></Link>
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="h-64 rounded-[32px] border-2 border-dashed border-zinc-200 dark:border-white/10 flex flex-col items-center justify-center text-center p-8">
                                        <ChefHat className="w-12 h-12 text-zinc-300 mb-4" />
                                        <h3 className="text-xl font-black uppercase italic tracking-tighter text-zinc-400">No active plan found</h3>
                                        <p className="text-sm text-muted-foreground mt-2 max-w-xs">Start your culinary journey by generating a new personalized meal plan.</p>
                                        <Button asChild className="mt-6 rounded-xl h-12 px-8 font-black uppercase tracking-widest bg-zinc-950 dark:bg-white text-white dark:text-black">
                                            <Link href="/plan">CREATE PLAN</Link>
                                        </Button>
                                    </div>
                                )}
                            </CardContent>
                        </div>
                    </Card>

                    {/* Household Snapshot */}
                    <Card className="border-none shadow-2xl rounded-[40px] bg-white dark:bg-zinc-900 overflow-hidden">
                        <CardHeader className="p-8 md:p-10 pb-4">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-xl bg-primary/10 text-primary">
                                    <Users className="w-5 h-5" />
                                </div>
                                <CardTitle className="text-xl font-black uppercase italic tracking-tighter text-zinc-900 dark:text-white">Household</CardTitle>
                            </div>
                        </CardHeader>
                        <CardContent className="p-8 md:p-10 pt-4 space-y-6 text-zinc-900 dark:text-zinc-100">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-zinc-50 dark:bg-zinc-800/50 p-4 rounded-2xl border border-zinc-100 dark:border-white/5">
                                    <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1">People</p>
                                    <p className="text-xl font-black italic uppercase">{(profile?.adults ?? 0) + (profile?.children ?? 0) + (profile?.toddlers ?? 0)} Members</p>
                                </div>
                                <div className="bg-zinc-50 dark:bg-zinc-800/50 p-4 rounded-2xl border border-zinc-100 dark:border-white/5">
                                    <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1">Budget</p>
                                    <p className="text-xl font-black italic uppercase">€{profile?.weeklyBudgetEuro ?? 0}/wk</p>
                                </div>
                            </div>
                            <div className="bg-zinc-50 dark:bg-zinc-800/50 p-6 rounded-2xl border border-zinc-100 dark:border-white/5 flex-1">
                                <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-3 italic">Dietary Standards</p>
                                <div className="flex flex-wrap gap-2">
                                    {profile?.dietTypes.map(d => (
                                        <Badge key={d} className="bg-zinc-900 text-white dark:bg-white dark:text-black border-none text-[9px] font-black uppercase">{d}</Badge>
                                    ))}
                                    {profile?.allergens.map(a => (
                                        <Badge key={a} variant="destructive" className="text-[9px] font-black uppercase">{a}</Badge>
                                    ))}
                                    {!profile?.dietTypes.length && !profile?.allergens.length && (
                                        <span className="text-xs font-medium italic text-zinc-400">No restrictions set</span>
                                    )}
                                </div>
                            </div>
                            <Button asChild variant="outline" className="w-full h-12 rounded-xl font-black uppercase tracking-widest border-zinc-200 dark:border-white/10 text-zinc-900 dark:text-white">
                                <Link href="/household">EDIT PREFERENCES</Link>
                            </Button>
                        </CardContent>
                    </Card>

                    {/* Progress Tracker */}
                    <Card className="border-none shadow-2xl rounded-[40px] bg-white dark:bg-zinc-900 overflow-hidden">
                        <CardHeader className="p-8 md:p-10 pb-4">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-xl bg-primary/10 text-primary">
                                    <TrendingUp className="w-5 h-5" />
                                </div>
                                <CardTitle className="text-xl font-black uppercase italic tracking-tighter text-zinc-900 dark:text-white">Plan Status</CardTitle>
                            </div>
                        </CardHeader>
                        <CardContent className="p-8 md:p-10 pt-4 space-y-6 text-zinc-900 dark:text-zinc-100">
                            <div className="space-y-4">
                                <div className="flex justify-between items-end">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Current Progress</span>
                                    <span className="text-lg font-black italic uppercase">{totalDays > 0 ? `Day ${currentDay} of ${totalDays}` : '0%'}</span>
                                </div>
                                <div className="h-3 w-full bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden shadow-inner">
                                    <div 
                                        className="h-full bg-primary shadow-[0_0_15px_rgba(var(--primary),0.5)] transition-all duration-1000" 
                                        style={{ width: totalDays > 0 ? `${(currentDay/totalDays) * 100}%` : '0%' }}
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-1 gap-3">
                                <Button asChild size="lg" className="h-14 rounded-2xl font-black uppercase tracking-widest bg-zinc-950 dark:bg-white text-white dark:text-black shadow-xl hover:scale-[1.02] transition-all">
                                    <Link href="/plan" className="flex items-center gap-2">
                                        <Calendar className="w-5 h-5" /> FULL CALENDAR
                                    </Link>
                                </Button>
                                <Button asChild variant="outline" size="lg" className="h-14 rounded-2xl font-black uppercase tracking-widest border-zinc-200 dark:border-white/10 text-zinc-900 dark:text-white">
                                    <Link href="/plan" className="flex items-center gap-2">
                                        <ShoppingCart className="w-5 h-5" /> GROCERY LIST
                                    </Link>
                                </Button>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Quick Action Banner */}
                    <Card className="lg:col-span-2 border-none shadow-2xl rounded-[40px] bg-zinc-950 dark:bg-white overflow-hidden text-white dark:text-black">
                        <CardContent className="p-8 md:p-12 flex flex-col md:flex-row items-center gap-8 justify-between">
                            <div className="space-y-4 text-center md:text-left">
                                <div className="inline-flex items-center gap-2 rounded-full bg-primary/20 border border-primary/20 px-4 py-1 text-[9px] font-black text-primary uppercase tracking-widest">
                                    <ChefHat className="h-3 w-3" />
                                    <span>Chef's Insight</span>
                                </div>
                                <h3 className="text-3xl md:text-4xl font-black tracking-tighter uppercase italic leading-none">Ready for something fresh?</h3>
                                <p className="text-white/60 dark:text-black/60 font-medium text-sm md:text-base max-w-lg">
                                    Your AI Kitchen Protocol is monitoring your preferences. New seasonal ingredients are trending in your area.
                                </p>
                            </div>
                            <Button asChild size="lg" className="h-16 px-10 rounded-2xl font-black uppercase tracking-widest bg-primary hover:bg-primary/90 text-white shadow-[0_20px_40px_-10px_rgba(var(--primary),0.4)] hover:scale-105 active:scale-95 transition-all shrink-0">
                                <Link href="/plan">REGENERATE PLAN</Link>
                            </Button>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
