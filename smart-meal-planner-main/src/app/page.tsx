import Link from "next/link";
import { getSession } from "~/server/auth";
import { ChefHat, ArrowRight, Play, Sparkles, UtensilsCrossed, Calendar, ShoppingCart, Target, LayoutDashboard } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";

export default async function Home() {
    const session = await getSession();
    const isLoggedIn = !!session;

    return (
        <div className="flex flex-col w-full min-h-full">
            {/* 1. HERO SECTION - IMMERSIVE VIDEO */}
            <section className="relative w-full h-[calc(100vh-3.5rem-4rem)] md:h-[calc(100vh-3.5rem)] overflow-hidden flex flex-col items-center justify-center px-4">
                <div className="absolute inset-0 z-0">
                    <video 
                        key={isLoggedIn ? "logged-in" : "guest"}
                        autoPlay 
                        loop 
                        muted 
                        playsInline
                        className="h-full w-full object-cover"
                    >
                        <source 
                            src={isLoggedIn 
                                ? "/videos/auth/7601423-hd_1080_1920_24fps.mp4" 
                                : "/videos/auth/3209013-uhd_3840_2160_25fps.mp4"
                            } 
                            type="video/mp4" 
                        />

                    </video>
                    {/* Lighter, more vibrant overlay */}

                    <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-background" />
                </div>

                <div className="relative z-10 w-full max-w-5xl flex flex-col items-center text-center gap-8">
                    <div className="flex flex-col items-center gap-6 animate-in fade-in slide-in-from-top-10 duration-1000">
                        <div className="space-y-4">
                            <h1 className="text-4xl md:text-9xl font-black tracking-tighter uppercase italic drop-shadow-[0_10px_30px_rgba(0,0,0,0.5)]">
                                <span className="text-black drop-shadow-[0_2px_10px_rgba(255,255,255,0.2)]">Smart</span>{" "}
                                <span className="text-black drop-shadow-[0_2px_10px_rgba(255,255,255,0.2)]">Meal</span>{" "}
                                <span className="text-white">Planner</span>
                            </h1>
                            <p className="text-black text-lg md:text-2xl font-bold tracking-[0.2em] uppercase opacity-95 drop-shadow-[0_2px_10px_rgba(255,255,255,0.2)]">
                                Your Personal AI Executive Chef
                            </p>
                        </div>
                    </div>

                    {/* ONLY SHOW BUTTONS FOR GUESTS */}
                    {!isLoggedIn && (
                        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-4 animate-in fade-in slide-in-from-bottom-10 duration-1000 delay-300 w-full max-w-md sm:max-w-none">
                            <Button asChild size="lg" className="w-full sm:w-auto h-16 px-12 rounded-2xl text-lg font-black bg-primary hover:bg-primary/90 text-white shadow-2xl transition-all active:scale-95 group">
                                <Link href="/login" className="flex items-center gap-2">
                                    GET STARTED <ArrowRight className="h-6 w-6 group-hover:translate-x-1 transition-transform" />
                                </Link>
                            </Button>
                            
                            <Button variant="outline" size="lg" className="w-full sm:w-auto h-16 px-12 rounded-2xl text-lg font-black border-white bg-white/10 text-white backdrop-blur-md hover:bg-white hover:text-black transition-all">
                                <Link href="/register">
                                    JOIN THE FAMILY
                                </Link>
                            </Button>
                        </div>
                    )}
                </div>

                <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-black animate-bounce">
                    <span className="text-[40px] font-black uppercase tracking-[0.3em]">Explore</span>
                    <div className="w-px h-8 bg-black/50" />
                </div>
            </section>

            {/* 2. INTRODUCTION SECTION */}
            <section className="relative py-24 md:py-32 bg-white dark:bg-zinc-950 overflow-hidden">
                <div className="container mx-auto px-4 max-w-6xl relative z-10">
                    <div className="grid md:grid-cols-2 gap-16 items-center">
                        <div className="space-y-8">
                            <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-1.5 text-[10px] font-black text-primary uppercase tracking-widest text-center">
                                <ChefHat className="h-4 w-4" />
                                <span>Future of Cooking</span>
                            </div>
                            <h2 className="text-4xl md:text-6xl font-black tracking-tight leading-tight uppercase italic text-center md:text-left">
                                AI Cooking <br/> Perfectly Scaled.
                            </h2>
                            <p className="text-xl text-muted-foreground leading-relaxed font-medium text-center md:text-left">
                                Forget generic recipes. We use advanced AI to create meal plans that respect your budget, your allergens, and your exact household size—down to the last gram.
                            </p>
                        </div>
                        <div className="relative hidden md:block">
                            <div className="absolute -inset-4 bg-primary/20 rounded-[40px] blur-2xl opacity-30" />
                            <Card className="border-none shadow-2xl rounded-[40px] overflow-hidden relative">
                                <img 
                                    src="/images/auth/chef.png" 
                                    alt="Chef Cooking"
                                    className="w-full h-full object-cover aspect-[4/3]"
                                />
                            </Card>
                        </div>
                    </div>
                </div>
            </section>

            {/* 3. FEATURES GRID */}
            <section className="py-24 bg-zinc-50 dark:bg-zinc-900/50">
                <div className="container mx-auto px-4 max-w-6xl">
                    <div className="text-center mb-20 space-y-4">
                        <h3 className="text-sm font-black text-primary uppercase tracking-[0.4em]">Capabilities</h3>
                        <h2 className="text-4xl md:text-5xl font-black uppercase italic tracking-tight text-center">Everything you need.</h2>
                    </div>

                    <div className="grid md:grid-cols-3 gap-8">
                        {[
                            { 
                                icon: <Calendar className="h-8 w-8" />, 
                                title: "7-Day Planning", 
                                desc: "Dynamic weekly plans generated in seconds based on your specific dietary profile." 
                            },
                            { 
                                icon: <Target className="h-8 w-8" />, 
                                title: "Exact Scaling", 
                                desc: "No more leftovers or hunger. We calculate portions for adults, children, and toddlers." 
                            },
                            { 
                                icon: <ShoppingCart className="h-8 w-8" />, 
                                title: "Smart Grocery", 
                                desc: "Unified shopping lists categorized by aisle to save you time and money." 
                            }
                        ].map((feature, i) => (
                            <Card key={i} className="group border-none shadow-lg hover:shadow-2xl transition-all duration-500 rounded-[32px] bg-white dark:bg-zinc-900 p-8">
                                <CardContent className="p-0 space-y-6 text-center">
                                    <div className="h-16 w-16 mx-auto rounded-2xl bg-primary/10 text-primary flex items-center justify-center transition-transform group-hover:scale-110 group-hover:rotate-3">
                                        {feature.icon}
                                    </div>
                                    <h4 className="text-2xl font-bold tracking-tight uppercase tracking-tighter">{feature.title}</h4>
                                    <p className="text-muted-foreground leading-relaxed font-medium">
                                        {feature.desc}
                                    </p>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                </div>
            </section>

            {/* 4. FINAL CTA SECTION (Hidden if already logged in) */}
            {!isLoggedIn && (
                <section className="py-32 bg-primary text-primary-foreground text-center relative overflow-hidden">
                    <div className="container mx-auto px-4 max-w-2xl relative z-10 space-y-10">
                        <h2 className="text-5xl md:text-7xl font-black uppercase italic tracking-tighter text-center">Ready to Cook?</h2>
                        <p className="text-xl font-medium opacity-90 leading-relaxed text-center">
                            Join thousands of families saving time and money with Smart Meal Planner. Your first AI plan is seconds away.
                        </p>
                        <Button asChild size="lg" variant="secondary" className="h-16 px-12 rounded-2xl text-lg font-black shadow-2xl hover:scale-105 transition-all active:scale-95">
                            <Link href="/register">GET STARTED FOR FREE</Link>
                        </Button>
                    </div>
                </section>
            )}
        </div>
    );
}
