"use client";

import { register } from "./actions";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Card, CardContent } from "~/components/ui/card";
import { ChefHat, Loader2, Mail, Lock, User, AlertCircle, ArrowRight, Home } from "lucide-react";
import Link from "next/link";
import { Label } from "~/components/ui/label";
import { useRouter } from "next/navigation";

export default function RegisterPage() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [name, setName] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const router = useRouter();

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        try {
            const formData = new FormData();
            formData.append("email", email);
            formData.append("password", password);
            formData.append("name", name);
            const res = await register(formData);
            
            if (res?.success) {
                const result = await signIn("credentials", {
                    email,
                    password,
                    redirect: false,
                });

                if (result?.error) {
                    setError("Login after registration failed.");
                    setLoading(false);
                    return;
                }

                router.push("/onboarding");
            }
        } catch (err: any) {
            setError("Registration failed. Please try again.");
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen w-full relative bg-background pb-20 overflow-x-hidden text-zinc-900 dark:text-zinc-100">
            {/* Immersive Hero Header */}
            <div className="relative h-64 md:h-80 w-full overflow-hidden bg-zinc-950">
                <img 
                    src="/images/auth/register-bg.jpg" 
                    alt="Background"
                    className="h-full w-full object-cover opacity-80"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-black/40" />
                
                <div className="absolute inset-0 flex items-center justify-center p-6 pb-20 md:pb-24">
                    <div className="container mx-auto max-w-4xl flex flex-col items-center text-center">
                        <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-black px-5 py-2 text-[10px] font-black text-white uppercase tracking-[0.2em] shadow-2xl ring-1 ring-white/20 backdrop-blur-md">
                            <ChefHat className="h-4 w-4" />
                            <span>Culinary Onboarding</span>
                        </div>
                        <h1 className="text-4xl md:text-7xl font-black tracking-tighter text-white uppercase italic drop-shadow-2xl leading-none">
                            Join <span className="text-primary">Us</span>
                        </h1>
                    </div>
                </div>
            </div>

            {/* Back to Home Button */}
            <div className="absolute left-4 top-4 z-30 md:left-8 md:top-8">
                <Button
                    asChild
                    variant="outline"
                    size="sm"
                    className="rounded-full border-white/20 bg-black/20 text-white shadow-2xl backdrop-blur-md hover:bg-white hover:text-black transition-all gap-2 px-3 md:px-4 h-9 md:h-10 ring-1 ring-white/10"
                >
                    <Link href="/">
                        <Home className="h-4 w-4" />
                        <span className="font-bold uppercase tracking-widest text-[10px] hidden md:inline">Home</span>
                    </Link>
                </Button>
            </div>

            <div className="container relative z-20 mx-auto max-w-xl px-4 -mt-28 md:-mt-12">
                <Card className="rounded-[40px] border-none shadow-[0_32px_64px_-15px_rgba(0,0,0,0.2)] bg-white dark:bg-zinc-900 overflow-hidden transition-all duration-500 hover:scale-[1.01]">
                    <CardContent className="p-8 md:p-12">
                        <div className="flex flex-col items-center gap-4 mb-10 text-center">
                            <div className="h-16 w-16 rounded-2xl bg-zinc-950 dark:bg-zinc-800 flex items-center justify-center shadow-2xl transition-transform hover:rotate-3">
                                <ChefHat className="w-10 h-10 text-white" />
                            </div>
                            <div>
                                <h3 className="text-2xl md:text-3xl font-black tracking-tighter uppercase italic text-zinc-900 dark:text-white leading-none">Create Account</h3>
                                <p className="text-muted-foreground font-bold text-[9px] md:text-[10px] uppercase tracking-[0.2em] mt-2 italic">Start Your Culinary Journey</p>
                            </div>
                        </div>

                        {error && (
                            <div className="flex items-start gap-3 bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900 text-red-600 dark:text-red-400 p-5 rounded-2xl mb-8 text-sm animate-in fade-in slide-in-from-top-2">
                                <AlertCircle className="h-5 w-5 shrink-0" />
                                <p className="font-bold leading-snug uppercase text-[10px] md:text-[11px] tracking-tight">{error}</p>
                            </div>
                        )}

                        <form onSubmit={handleSubmit} className="space-y-6">
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <Label className="font-black uppercase text-[9px] md:text-[10px] tracking-widest text-muted-foreground ml-1">Full Name</Label>
                                    <div className="relative group">
                                        <User className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-zinc-400 group-focus-within:text-primary transition-colors" />
                                        <Input
                                            name="name"
                                            placeholder="Your full name here"
                                            value={name}
                                            onChange={(e) => setName(e.target.value)}
                                            required
                                            className="h-14 pl-12 bg-zinc-50 dark:bg-zinc-800 border-zinc-100 dark:border-white/5 text-zinc-900 dark:text-white font-bold rounded-2xl focus-visible:ring-primary/20 focus-visible:border-primary/40 transition-all shadow-inner"
                                            disabled={loading}
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label className="font-black uppercase text-[9px] md:text-[10px] tracking-widest text-muted-foreground ml-1">Email Address</Label>
                                    <div className="relative group">
                                        <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-zinc-400 group-focus-within:text-primary transition-colors" />
                                        <Input
                                            name="email"
                                            type="email"
                                            placeholder="name@gmail.com"
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            required
                                            className="h-14 pl-12 bg-zinc-50 dark:bg-zinc-800 border-zinc-100 dark:border-white/5 text-zinc-900 dark:text-white font-bold rounded-2xl focus-visible:ring-primary/20 focus-visible:border-primary/40 transition-all shadow-inner"
                                            disabled={loading}
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label className="font-black uppercase text-[9px] md:text-[10px] tracking-widest text-muted-foreground ml-1">Create Password</Label>
                                    <div className="relative group">
                                        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-zinc-400 group-focus-within:text-primary transition-colors" />
                                        <Input
                                            name="password"
                                            type="password"
                                            placeholder="••••••••"
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            required
                                            className="h-14 pl-12 bg-zinc-50 dark:bg-zinc-800 border-zinc-100 dark:border-white/5 text-zinc-900 dark:text-white font-bold rounded-2xl focus-visible:ring-primary/20 focus-visible:border-primary/40 transition-all shadow-inner"
                                            disabled={loading}
                                        />
                                    </div>
                                </div>
                            </div>

                            <Button
                                type="submit"
                                className="w-full h-16 text-base md:text-lg font-black bg-zinc-950 dark:bg-white text-white dark:text-black rounded-2xl shadow-xl active:scale-95 transition-all hover:scale-[1.02] group uppercase italic tracking-tighter"
                                disabled={loading}
                            >
                                {loading ? (
                                    <Loader2 className="h-7 w-7 animate-spin" />
                                ) : (
                                    <span className="flex items-center gap-3">
                                        ESTABLISH ACCOUNT <ArrowRight className="h-6 w-6 group-hover:translate-x-1 transition-transform" />
                                    </span>
                                )}
                            </Button>
                        </form>

                        <div className="mt-10 pt-8 border-t border-zinc-100 dark:border-white/5 text-center flex flex-col gap-6">
                            <Link href="/login" className="text-muted-foreground text-sm font-bold hover:text-zinc-900 dark:hover:text-white transition-colors uppercase tracking-tight italic">
                                Already a member? <span className="text-primary ml-1 underline underline-offset-4 font-black not-italic">SIGN IN</span>
                            </Link>
                            
                            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-6 text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 dark:text-zinc-400">
                                <Link href="/privacy" className="hover:text-zinc-900 dark:hover:text-white transition-colors">Privacy Policy</Link>
                                <span className="hidden sm:block h-1 w-1 rounded-full bg-zinc-300 dark:bg-zinc-700" />
                                <Link href="/terms" className="hover:text-zinc-900 dark:hover:text-white transition-colors">Terms and Policies</Link>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <div className="mt-12 text-center">
                    <p className="text-[11px] font-black uppercase tracking-[0.4em] text-zinc-500/60 dark:text-zinc-400/60 italic">
                        Smart Meal Planner • Secure Registration Infrastructure • 2026
                    </p>
                </div>
            </div>
        </div>
    );
}
