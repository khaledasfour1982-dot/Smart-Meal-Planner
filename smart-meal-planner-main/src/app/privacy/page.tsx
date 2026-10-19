"use client";

import { Card, CardHeader, CardTitle, CardContent } from "~/components/ui/card";
import { ShieldCheck, Lock, Eye, Database, ChefHat, ChevronLeft } from "lucide-react";
import Link from "next/link";
import { Button } from "~/components/ui/button";
import { useRouter } from "next/navigation";

export default function PrivacyPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Immersive Header Section */}
      <div className="relative h-64 w-full md:h-80 overflow-hidden bg-zinc-900">
        <img 
          src="/images/auth/privacy-bg.jpg" 
          alt="Privacy Background"
          className="h-full w-full object-cover opacity-30"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
        
        <div className="absolute inset-0 flex items-end justify-start p-6 pb-16 md:p-12 md:pb-12">
          <div className="container mx-auto max-w-5xl">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-black/60 px-3 py-1 text-[10px] font-black text-primary uppercase tracking-[0.2em] backdrop-blur-xl border border-white/10 shadow-2xl">
              <ShieldCheck className="h-3 w-3" />
              <span>Trust & Safety</span>
            </div>
            <h1 className="text-3xl font-black tracking-tighter text-foreground sm:text-6xl uppercase italic leading-none">
              Privacy Policy
            </h1>
          </div>
        </div>

        <div className="absolute left-4 top-4 z-30 md:left-8 md:top-8">
          <Button
            variant="outline"
            size="icon"
            className="h-10 w-10 rounded-full border-black/10 bg-white/10 shadow-2xl backdrop-blur-xl hover:bg-white transition-all text-foreground"
            onClick={() => router.back()}
          >
            <ChevronLeft className="h-6 w-6" />
          </Button>
        </div>
      </div>

      <div className="container mx-auto max-w-5xl px-4 -mt-10 relative z-20 space-y-8">
        
        <div className="p-6 md:p-8 bg-card rounded-[40px] border-none shadow-2xl space-y-12">
          <section className="space-y-6">
            <div className="flex items-center gap-4">
              <div className="h-10 w-10 md:h-12 md:w-12 shrink-0 rounded-xl bg-primary/10 flex items-center justify-center">
                <Database className="h-5 w-5 md:h-6 md:w-6 text-primary" />
              </div>
              <h2 className="text-xl md:text-2xl font-black tracking-tighter uppercase italic leading-tight">1. Data Collection</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-muted-foreground font-medium leading-relaxed md:pl-16">
              <div className="p-6 rounded-3xl bg-muted/30 border border-border/50">
                <p className="text-foreground font-bold mb-2">Account Info</p>
                Email address and hashed password encrypted via bcryptjs.
              </div>
              <div className="p-6 rounded-3xl bg-muted/30 border border-border/50">
                <p className="text-foreground font-bold mb-2">Personal Preferences</p>
                Household size, dietary needs, allergens, and dislikes.
              </div>
            </div>
          </section>

          <section className="space-y-6">
            <div className="flex items-center gap-4">
              <div className="h-10 w-10 md:h-12 md:w-12 shrink-0 rounded-xl bg-primary/10 flex items-center justify-center">
                <Eye className="h-5 w-5 md:h-6 md:w-6 text-primary" />
              </div>
              <h2 className="text-xl md:text-2xl font-black tracking-tighter uppercase italic leading-tight">2. Usage & AI</h2>
            </div>
            <div className="md:pl-16 space-y-4 text-muted-foreground font-medium leading-relaxed max-w-3xl">
              <p>
                Your data is used to provide accurate meal scaling and safety filtering. We pass your dietary constraints to AI providers (Groq/OpenAI) as hard constraints to ensure recipe safety.
              </p>
              <p>
                We do not sell your personal data to third parties. Your information stays within the Smart Meal Planner ecosystem.
              </p>
            </div>
          </section>

          <section className="space-y-6">
            <div className="flex items-center gap-4">
              <div className="h-10 w-10 md:h-12 md:w-12 shrink-0 rounded-xl bg-primary/10 flex items-center justify-center">
                <Lock className="h-5 w-5 md:h-6 md:w-6 text-primary" />
              </div>
              <h2 className="text-xl md:text-2xl font-black tracking-tighter uppercase italic leading-tight">3. Security</h2>
            </div>
            <div className="md:pl-16 space-y-4 text-muted-foreground font-medium leading-relaxed max-w-3xl">
              <p>
                All data is stored in secure **Neon PostgreSQL** instances. We employ industry-standard encryption for all sensitive fields and maintain regular security audits.
              </p>
            </div>
          </section>
        </div>

        <div className="pt-12 text-center">
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground/40 italic">
            Last Updated: March 2026 • Version 1.0
          </p>
        </div>
      </div>
    </div>
  );
}
