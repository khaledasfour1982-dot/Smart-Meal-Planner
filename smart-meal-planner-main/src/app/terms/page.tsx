"use client";

import { ShieldAlert, Scale, FileText, ChevronLeft, ChefHat } from "lucide-react";
import { Button } from "~/components/ui/button";
import { useRouter } from "next/navigation";

export default function TermsPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Immersive Header Section */}
      <div className="relative h-64 w-full md:h-80 overflow-hidden bg-zinc-900">
        <img 
          src="/images/auth/terms-bg.jpg" 
          alt="Terms Background"
          className="h-full w-full object-cover opacity-30"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
        
        <div className="absolute inset-0 flex items-end justify-start p-6 pb-16 md:p-12 md:pb-12">
          <div className="container mx-auto max-w-5xl">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-black/60 px-3 py-1 text-[10px] font-black text-primary uppercase tracking-[0.2em] backdrop-blur-xl border border-white/10 shadow-2xl">
              <Scale className="h-3 w-3" />
              <span>Legal Guidelines</span>
            </div>
            <h1 className="text-3xl font-black tracking-tighter text-foreground sm:text-6xl uppercase italic leading-none">
              Terms of Service
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
                <FileText className="h-5 w-5 md:h-6 md:w-6 text-primary" />
              </div>
              <h2 className="text-xl md:text-2xl font-black tracking-tighter uppercase italic leading-tight">1. Acceptance of Terms</h2>
            </div>
            <div className="md:pl-16 text-muted-foreground font-medium leading-relaxed max-w-3xl">
              By using Smart Meal Planner, you agree to these terms. Our service provides AI-generated meal plans based on your inputs.
            </div>
          </section>

          <section className="space-y-6">
            <div className="flex items-center gap-4">
              <div className="h-10 w-10 md:h-12 md:w-12 shrink-0 rounded-xl bg-amber-500/10 flex items-center justify-center">
                <ShieldAlert className="h-5 w-5 md:h-6 md:w-6 text-amber-600" />
              </div>
              <h2 className="text-xl md:text-2xl font-black tracking-tighter uppercase italic text-amber-600 leading-tight">2. Medical Disclaimer</h2>
            </div>
            <div className="md:pl-16 text-muted-foreground font-medium leading-relaxed max-w-3xl">
              <p className="bg-amber-50 border border-amber-100 p-6 rounded-3xl text-amber-900 font-bold mb-4">
                Smart Meal Planner is an AI tool, not a medical professional.
              </p>
              <p>
                Always verify ingredients against your specific medical needs and allergies. We are not liable for adverse reactions or nutritional inaccuracies in AI-generated content.
              </p>
            </div>
          </section>

          <section className="space-y-6">
            <div className="flex items-center gap-4">
              <div className="h-10 w-10 md:h-12 md:w-12 shrink-0 rounded-xl bg-primary/10 flex items-center justify-center">
                <ChefHat className="h-5 w-5 md:h-6 md:w-6 text-primary" />
              </div>
              <h2 className="text-xl md:text-2xl font-black tracking-tighter uppercase italic leading-tight">3. User Conduct</h2>
            </div>
            <div className="md:pl-16 text-muted-foreground font-medium leading-relaxed max-w-3xl">
              Users are responsible for maintaining the confidentiality of their account. You agree not to use the service for any illegal or unauthorized purpose.
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
