"use client";

import Link from "next/link";
import { ChefHat, Github, Instagram, Mail } from "lucide-react";

function XIcon(props: React.SVGProps<SVGSVGElement>) {
    return (
        <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
            <path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z" />
        </svg>
    );
}

export function AppFooter() {
    return (
        <footer className="w-full bg-white dark:bg-zinc-950 border-t border-zinc-100 dark:border-white/5 pt-16 pb-24 md:pb-12">
            <div className="container mx-auto px-6 md:px-12 max-w-7xl">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-12 mb-16">
                    {/* Brand Section */}
                    <div className="md:col-span-2 space-y-6">
                        <Link href="/" className="flex items-center gap-3 group w-fit">
                            <div className="h-10 w-10 rounded-xl bg-zinc-950 dark:bg-white flex items-center justify-center transition-transform group-hover:rotate-3 shadow-lg">
                                <ChefHat className="h-6 w-6 text-white dark:text-black" />
                            </div>
                            <span className="text-2xl font-black italic tracking-tighter uppercase text-zinc-900 dark:text-white">
                                Smart <span className="text-primary">Meal</span> Planner
                            </span>
                        </Link>
                        <p className="max-w-md text-muted-foreground text-sm font-medium leading-relaxed">
                            Revolutionizing the modern kitchen with advanced AI technology. We help families save time, reduce waste, and discover professional-grade recipes tailored to their unique dietary needs.
                        </p>
                        <div className="flex items-center gap-4">
                            {[
                                { icon: XIcon, href: "#" },
                                { icon: Instagram, href: "#" },
                                { icon: Github, href: "#" },
                                { icon: Mail, href: "mailto:hello@smartmealplanner.com" }
                            ].map((social, i) => (
                                <Link 
                                    key={i} 
                                    href={social.href} 
                                    className="h-10 w-10 rounded-xl bg-zinc-100 dark:bg-zinc-900 flex items-center justify-center text-zinc-950 dark:text-zinc-100 hover:scale-110 hover:bg-primary hover:text-primary-foreground transition-all shadow-sm group/social"
                                >
                                    <social.icon className="h-4.5 w-4.5 transition-transform group-hover/social:rotate-6" />
                                </Link>
                            ))}
                        </div>
                    </div>

                    {/* Legal & Policy */}
                    <div className="space-y-6">
                        <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400">Legal Protocol</h4>
                        <ul className="space-y-4">
                            {[
                                { label: "Privacy Policy", href: "/privacy" },
                                { label: "Terms and Policies", href: "/terms" }
                            ].map((link) => (
                                <li key={link.label}>
                                    <Link href={link.href} className="text-sm font-bold text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white transition-colors uppercase tracking-tight italic">
                                        {link.label}
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>

                {/* Bottom Bar */}
                <div className="pt-8 border-t border-zinc-100 dark:border-white/5 flex flex-col md:flex-row justify-between items-center gap-6">
                    <p className="text-[10px] font-black uppercase tracking-[0.4em] text-zinc-500 dark:text-zinc-400">
                        © 2026 Smart Meal Planner • AI Kitchen Technology • Secure Infrastructure
                    </p>
                    <div className="flex items-center gap-3 px-3 py-1.5 rounded-full bg-zinc-100 dark:bg-zinc-900 shadow-sm border border-zinc-200 dark:border-white/5">
                        <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        <span className="text-[9px] font-black uppercase tracking-widest text-zinc-950 dark:text-zinc-100">AI Protocol Active</span>
                    </div>
                </div>
            </div>
        </footer>
    );
}
