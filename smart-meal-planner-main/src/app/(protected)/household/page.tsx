"use client";

import { useState, useEffect } from "react";
import { api } from "~/trpc/react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Badge } from "~/components/ui/badge";
import { Plus, Minus, Loader2, X, PlusCircle, Scale, Heart, AlertCircle, Sparkles, LayoutDashboard, Coffee, Users, ChefHat } from "lucide-react";
import { cn } from "~/lib/utils";

/**
 * Household Size Section Component
 */
function HouseholdSizeSection({
  counts,
  onUpdate,
}: {
  counts: { adults: number; children: number; toddlers: number };
  onUpdate: (key: keyof typeof counts, val: number) => void;
}) {
  const items = [
    { key: "adults", label: "Adults", sub: "12+", min: 1, icon: <Users className="w-5 h-5" /> },
    { key: "children", label: "Children", sub: "4-11", min: 0, icon: <Coffee className="w-5 h-5" /> },
    { key: "toddlers", label: "Toddlers", sub: "0-3", min: 0, icon: <Sparkles className="w-5 h-5" /> },
  ] as const;

  return (
    <Card className="md:col-span-2 border-none shadow-2xl rounded-[40px] bg-white dark:bg-zinc-900 overflow-hidden group hover:scale-[1.01] transition-all duration-500">
      <CardHeader className="p-8 md:p-12 pb-4">
        <div className="flex items-center gap-4 mb-4">
            <div className="h-14 w-14 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center shadow-inner group-hover:rotate-3 transition-transform">
                <Users className="w-7 h-7 text-zinc-900 dark:text-white" />
            </div>
            <div>
                <CardTitle className="text-2xl md:text-3xl font-black uppercase italic tracking-tighter text-zinc-900 dark:text-white leading-none mb-2">Household Size</CardTitle>
                <CardDescription className="text-muted-foreground text-[9px] md:text-sm font-bold uppercase tracking-widest italic">How many people are we planning for?</CardDescription>
            </div>
        </div>
      </CardHeader>
      <CardContent className="p-8 md:p-12 pt-4 grid gap-6 sm:grid-cols-3">
        {items.map((item) => (
          <div key={item.key} className="flex flex-col items-center gap-6 md:gap-8 p-8 rounded-[32px] bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-100 dark:border-white/5 shadow-sm transition-all hover:shadow-md group/item">
            <div className="text-center">
              <div className="flex items-center justify-center gap-2 mb-2">
                <span className="text-zinc-400 group-hover/item:text-primary transition-colors">{item.icon}</span>
                <Label className="text-lg font-black text-zinc-900 dark:text-white uppercase tracking-tighter">{item.label}</Label>
              </div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground italic">Ages {item.sub}</p>
            </div>
            <div className="flex items-center gap-6">
              <Button
                variant="outline"
                size="icon"
                className="h-11 w-11 rounded-2xl border-zinc-200 dark:border-white/10 text-zinc-900 dark:text-white hover:bg-zinc-900 hover:text-white dark:hover:bg-white dark:hover:text-black transition-all shadow-sm active:scale-90"
                onClick={() => onUpdate(item.key, Math.max(item.min, counts[item.key] - 1))}
              >
                <Minus className="h-5 w-5" />
              </Button>
              <span className="text-4xl md:text-3xl font-black w-10 text-center tabular-nums text-zinc-900 dark:text-white">{counts[item.key]}</span>
              <Button
                variant="outline"
                size="icon"
                className="h-11 w-11 rounded-2xl border-zinc-200 dark:border-white/10 text-zinc-900 dark:text-white hover:bg-zinc-900 hover:text-white dark:hover:bg-white dark:hover:text-black transition-all shadow-sm active:scale-90"
                onClick={() => onUpdate(item.key, Math.min(10, counts[item.key] + 1))}
              >
                <Plus className="h-5 w-5" />
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/**
 * Tag Input Section Component
 */
function TagInputSection({
  title,
  description,
  tags,
  placeholder,
  variant = "secondary",
  icon,
  onAdd,
  onRemove,
  className,
}: {
  title: string;
  description: string;
  tags: string[];
  placeholder: string;
  variant?: "secondary" | "destructive" | "outline";
  icon?: React.ReactNode;
  onAdd: (val: string) => void;
  onRemove: (val: string) => void;
  className?: string;
}) {
  const [input, setInput] = useState("");

  function handleAdd() {
    if (input.trim()) {
      onAdd(input.trim());
      setInput("");
    }
  }

  return (
    <Card className={cn("border-none shadow-2xl rounded-[40px] bg-white dark:bg-zinc-900 overflow-hidden group hover:scale-[1.01] transition-all duration-500", className)}>
      <CardHeader className="p-8 md:p-10 pb-4">
        <div className="flex items-center gap-4 mb-2">
            <div className={cn("h-12 w-12 rounded-2xl flex items-center justify-center transition-transform group-hover:rotate-3", variant === 'destructive' ? 'bg-red-50 text-red-500' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white')}>
                {icon}
            </div>
            <div>
                <CardTitle className="text-2xl font-black uppercase italic tracking-tighter text-zinc-900 dark:text-white">
                    {title}
                </CardTitle>
                <CardDescription className="text-muted-foreground text-xs font-bold uppercase tracking-widest italic">{description}</CardDescription>
            </div>
        </div>
      </CardHeader>
      <CardContent className="p-8 md:p-10 pt-4 space-y-8">
        <div className="flex gap-3 bg-zinc-50 dark:bg-zinc-800/50 p-2 rounded-[24px] border border-zinc-100 dark:border-white/5 focus-within:border-zinc-300 dark:focus-within:border-white/20 transition-all shadow-inner">
          <Input
            placeholder={placeholder}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            className="border-none bg-transparent shadow-none focus-visible:ring-0 text-base text-zinc-900 dark:text-white h-12 placeholder:text-zinc-400 font-bold"
          />
          <Button variant="default" size="icon" onClick={handleAdd} className="h-12 w-12 rounded-xl bg-zinc-900 dark:bg-white text-white dark:text-black hover:scale-105 transition-all">
            <PlusCircle className="h-6 w-6" />
          </Button>
        </div>
        <div className="flex flex-wrap gap-3 min-h-12">
          {tags.map((tag) => (
            <Badge key={tag} variant={variant} className={cn(
                "gap-2 px-5 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-sm transition-all border",
                variant === 'destructive' 
                    ? 'bg-red-50 text-red-600 border-red-100 hover:bg-red-100' 
                    : variant === 'outline'
                        ? 'bg-zinc-50 text-zinc-600 border-zinc-200 hover:border-zinc-400'
                        : 'bg-zinc-900 text-white border-zinc-900 hover:bg-zinc-800'
            )}>
              {tag}
              <X className="h-3.5 w-3.5 cursor-pointer hover:scale-125 transition-transform" onClick={() => onRemove(tag)} />
            </Badge>
          ))}
          {tags.length === 0 && (
            <div className="text-[11px] font-black uppercase tracking-[0.2em] text-zinc-300 italic py-3">No items added</div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function HouseholdPage() {
  const [household, setHousehold] = useState({ adults: 1, children: 0, toddlers: 0 });
  const [multipliers, setMultipliers] = useState({ adult: 1.0, child: 0.75, toddler: 0.5 });
  const [dietTypes, setDietTypes] = useState<string[]>([]);
  const [allergens, setAllergens] = useState<string[]>([]);
  const [dislikes, setDislikes] = useState<string[]>([]);
  const [weeklyBudgetEuro, setWeeklyBudgetEuro] = useState(0);

  const { data: profile, isLoading: isFetching } = api.household.get.useQuery();

  const updateMutation = api.user.updateProfile.useMutation({
    onSuccess: () => alert("Profile saved successfully!"),
    onError: (err) => alert(`Error saving: ${err.message}`),
  });

  useEffect(() => {
    if (profile) {
      setHousehold({ adults: profile.adults, children: profile.children, toddlers: profile.toddlers });
      setDietTypes(profile.dietTypes);
      setAllergens(profile.allergens);
      setDislikes(profile.dislikes);
      setWeeklyBudgetEuro(profile.weeklyBudgetEuro || 0);
      if (profile.portionMultipliers) {
        setMultipliers(profile.portionMultipliers as typeof multipliers);
      }
    }
  }, [profile]);

  function handleSave() {
    updateMutation.mutate({
      ...household,
      dietTypes,
      allergens,
      dislikes,
      weeklyBudgetEuro,
      portionMultipliers: multipliers,
    });
  }

  if (isFetching) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full relative bg-background pb-32 overflow-x-hidden">
        {/* Lighter Hero Header */}
        <div className="relative h-64 w-full md:h-[450px] overflow-hidden bg-zinc-950">
            <img src="/images/auth/login-bg.jpg" alt="BG" className="h-full w-full object-cover opacity-80" />
            <div className="absolute inset-0 bg-linear-to-t from-background via-background/20 to-black/40" />
            
            <div className="absolute inset-0 flex items-center justify-start px-6 md:px-12">
                <div className="container mx-auto max-w-6xl pb-12 md:pb-32">
                    <div className="inline-flex items-center gap-2 rounded-full bg-black px-5 py-2 text-[9px] md:text-[10px] font-black text-white uppercase tracking-[0.2em] shadow-2xl ring-1 ring-white/20 mb-6 backdrop-blur-md">
                        <ChefHat className="h-4 w-4" />
                        <span>Household & Configuration</span>
                    </div>
                    <h1 className="text-3xl md:text-8xl font-black tracking-tighter text-white uppercase italic drop-shadow-2xl leading-[0.9]">
                        Family <br/> <span className="text-primary">& Standards</span>
                    </h1>
                </div>
            </div>
        </div>

        <div className="container relative z-10 mx-auto px-4 md:px-8 -mt-24 md:-mt-32 max-w-6xl space-y-12">
            <div className="grid gap-10">
                <HouseholdSizeSection
                    counts={household}
                    onUpdate={(k, v) => setHousehold((prev) => ({ ...prev, [k]: v }))}
                />

                {/* Portion Scaling */}
                <Card className="border-none shadow-2xl rounded-[40px] bg-white dark:bg-zinc-900 overflow-hidden group hover:scale-[1.01] transition-all duration-500">
                    <CardHeader className="p-8 md:p-12 pb-4">
                        <div className="flex items-center gap-4 mb-4">
                            <div className="h-14 w-14 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center shadow-inner group-hover:rotate-3 transition-transform">
                                <Scale className="h-7 w-7 text-zinc-900 dark:text-white" />
                            </div>
                            <div>
                                <CardTitle className="text-2xl md:text-3xl font-black uppercase italic tracking-tighter text-zinc-900 dark:text-white leading-none mb-2">
                                    Portion Precision
                                </CardTitle>
                                <CardDescription className="text-muted-foreground text-[9px] md:text-sm font-bold uppercase tracking-widest italic">Adjust relative hunger levels for each member.</CardDescription>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="p-8 md:p-12 pt-4 space-y-4">
                        <div className="grid grid-cols-1 gap-4 bg-zinc-50 dark:bg-zinc-800/50 p-6 md:p-10 rounded-[32px] border border-zinc-100 dark:border-white/5 shadow-inner">
                            {(Object.keys(multipliers) as Array<keyof typeof multipliers>).map((key) => (
                                <div key={key} className="space-y-6 p-6 md:py-10 transition-all hover:bg-white dark:hover:bg-zinc-800 rounded-[24px] group/scale">
                                    <div className="flex justify-between items-end">
                                        <div className="flex flex-col">
                                            <Label className="capitalize font-black text-base tracking-widest text-zinc-900 dark:text-white uppercase italic">{key}</Label>
                                            <span className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] mt-1">Scale Multiplier</span>
                                        </div>
                                        <div className="flex flex-col items-end">
                                            <span className="text-3xl md:text-2xl font-black text-zinc-900 dark:text-white tabular-nums italic drop-shadow-sm">{multipliers[key].toFixed(2)}x</span>
                                            <Badge className="bg-primary/10 text-primary border-none text-[8px] font-black uppercase mt-1">Standardized</Badge>
                                        </div>
                                    </div>
                                    <div className="relative pt-2">
                                        <input
                                            type="range"
                                            min={key === "toddler" ? 0.1 : 0.5}
                                            max={key === "adult" ? 2.0 : 1.5}
                                            step="0.05"
                                            value={multipliers[key]}
                                            onChange={(e) => setMultipliers((prev) => ({ ...prev, [key]: parseFloat(e.target.value) }))}
                                            className="w-full h-2 accent-primary bg-zinc-200 dark:bg-zinc-700 rounded-full cursor-pointer appearance-none transition-all hover:bg-zinc-300"
                                        />
                                        <div className="flex justify-between mt-3 text-[10px] font-black text-zinc-400 uppercase tracking-widest italic">
                                            <span>Leaner Portion</span>
                                            <span>Heartier Portion</span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                    <TagInputSection
                        title="Dietary Types"
                        description="e.g. Vegan, Keto, Halal"
                        tags={dietTypes}
                        placeholder="Add diet..."
                        icon={<Heart className="h-6 w-6" />}
                        onAdd={(val) => !dietTypes.includes(val) && setDietTypes([...dietTypes, val])}
                        onRemove={(val) => setDietTypes(dietTypes.filter((t) => t !== val))}
                    />

                    <TagInputSection
                        title="Allergens"
                        description="Safety first. Strictly excluded."
                        tags={allergens}
                        placeholder="Add allergen..."
                        variant="destructive"
                        icon={<AlertCircle className="h-6 w-6" />}
                        onAdd={(val) => !allergens.includes(val) && setAllergens([...allergens, val])}
                        onRemove={(val) => setAllergens(allergens.filter((t) => t !== val))}
                    />

                    <TagInputSection
                        title="Excluded Ingredients"
                        description="Avoid these specific flavor profiles."
                        tags={dislikes}
                        placeholder="e.g. Mushrooms, Cilantro..."
                        variant="outline"
                        className="md:col-span-2"
                        icon={<X className="h-6 w-6" />}
                        onAdd={(val) => !dislikes.includes(val) && setDislikes([...dislikes, val])}
                        onRemove={(val) => setDislikes(dislikes.filter((t) => t !== val))}
                    />

                    <Card className="md:col-span-2 border-none shadow-2xl rounded-[40px] bg-white dark:bg-zinc-900 overflow-hidden group hover:scale-[1.01] transition-all duration-500">
                        <CardHeader className="p-8 md:p-12 pb-4">
                            <div className="flex items-center gap-4 mb-2">
                                <div className="h-14 w-14 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center shadow-inner group-hover:rotate-3 transition-transform">
                                    <Sparkles className="h-7 w-7 text-zinc-900 dark:text-white" />
                                </div>
                                <div>
                                    <CardTitle className="text-2xl md:text-3xl font-black uppercase italic tracking-tighter text-zinc-900 dark:text-white leading-none">
                                    Weekly Budget
                                </CardTitle>
                                    <CardDescription className="text-muted-foreground text-sm font-bold uppercase tracking-widest italic mt-2">
                                        Favor cost-effective options in generation.
                                    </CardDescription>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="p-8 md:p-12 pt-4">
                            <div className="flex flex-col gap-6 md:flex-row md:items-center bg-zinc-50 dark:bg-zinc-800/50 p-10 rounded-[32px] border border-zinc-100 dark:border-white/5 transition-all hover:shadow-md">
                                <div className="flex-1">
                                    <Label htmlFor="budget" className="font-black uppercase tracking-[0.2em] text-xs text-muted-foreground italic mb-4 block">
                                        Budget Target (EUR per week)
                                    </Label>
                                    <div className="relative">
                                        <div className="absolute inset-y-0 left-5 flex items-center pointer-events-none">
                                            <span className="text-zinc-900 dark:text-white font-black text-2xl">€</span>
                                        </div>
                                        <Input
                                            id="budget"
                                            type="number"
                                            min={0}
                                            value={weeklyBudgetEuro}
                                            onChange={(e) => setWeeklyBudgetEuro(Number(e.target.value) || 0)}
                                            className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-white/10 text-zinc-900 dark:text-white font-black text-3xl h-20 pl-14 rounded-[24px] focus-visible:ring-zinc-900 dark:focus-visible:ring-white transition-all shadow-sm"
                                        />
                                    </div>
                                </div>
                                <div className="hidden md:flex flex-col items-end gap-2 opacity-30 italic">
                                    <span className="text-sm font-black uppercase tracking-widest text-zinc-900 dark:text-white">Cost-Aware</span>
                                    <span className="text-[10px] font-black uppercase tracking-widest text-zinc-900 dark:text-white text-right">AI Optimization <br/> Protocol active</span>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>

            <footer className="flex justify-center md:justify-end pt-16">
                <Button
                    size="lg"
                    className="w-full md:w-96 h-20 rounded-[32px] text-xl font-black bg-zinc-950 dark:bg-white text-white dark:text-black shadow-2xl transition-all hover:scale-[1.02] active:scale-[0.95] uppercase italic tracking-tighter"
                    onClick={handleSave}
                    disabled={updateMutation.isPending}
                >
                    {updateMutation.isPending ? (
                        <Loader2 className="mr-3 h-8 w-8 animate-spin" />
                    ) : (
                        <LayoutDashboard className="mr-3 h-7 w-7" />
                    )}
                    SAVE PROFILE CONFIGURATION
                </Button>
            </footer>
        </div>
    </div>
  );
}
