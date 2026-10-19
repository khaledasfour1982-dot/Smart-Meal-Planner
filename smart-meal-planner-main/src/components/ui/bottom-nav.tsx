"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useSession } from "next-auth/react"
import { Home, User, Utensils, Settings, LogIn, ShoppingCart } from "lucide-react"
import { Button } from "src/components/ui/button"
import { cn } from "~/lib/utils"

export function BottomNav() {
    const { data: session, status } = useSession()
    const isLoggedIn = status === "authenticated" && !!session
    const pathname = usePathname()

    const navItems = isLoggedIn 
        ? [
            { icon: Home, label: "Home", href: "/" },
            { icon: User, label: "Dashboard", href: "/dashboard" },
            { icon: Utensils, label: "Plan", href: "/plan" },
            { icon: ShoppingCart, label: "Cart", href: "/shopping-list" },
            { icon: Settings, label: "Household", href: "/household" }
        ]
        : [
            { icon: Home, label: "Home", href: "/" },
            { icon: LogIn, label: "Login", href: "/login" }
        ]

    return (
        <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-white/80 dark:bg-zinc-950/80 backdrop-blur-xl border-t border-zinc-100 dark:border-white/5 pb-safe">
            <div className={cn(
                "grid h-16 max-w-md mx-auto",
                isLoggedIn ? "grid-cols-5" : "grid-cols-2"
            )}>
                {navItems.map((item) => {
                    const isActive = pathname === item.href
                    return (
                        <Button 
                            key={item.href}
                            variant="ghost" 
                            size="sm" 
                            asChild 
                            className={cn(
                                "h-14 p-0 transition-all duration-300",
                                isActive 
                                    ? "text-zinc-950 dark:text-white" 
                                    : "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                            )}
                        >
                            <Link href={item.href} className="flex flex-col items-center gap-1">
                                <div className={cn(
                                    "p-1.5 rounded-lg transition-all duration-300",
                                    isActive && "bg-zinc-100 dark:bg-zinc-800 text-zinc-950 dark:text-white shadow-sm scale-110"
                                )}>
                                    <item.icon className="h-5 w-5" />
                                </div>
                                <span className={cn(
                                    "text-[11px] font-black uppercase tracking-tighter italic transition-all",
                                    isActive ? "opacity-100 text-zinc-950 dark:text-white" : "opacity-0 h-0 scale-0"
                                )}>
                                    {item.label}
                                </span>
                            </Link>
                        </Button>
                    )
                })}
            </div>
        </nav>
    )
}
