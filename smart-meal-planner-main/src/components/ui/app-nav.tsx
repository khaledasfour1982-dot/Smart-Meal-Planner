"use client"

import Link from "next/link"
import { useSession } from "next-auth/react"
import { Menu, LogOut, Home, ChefHat } from "lucide-react"
import { Button } from "src/components/ui/button"
import { Sheet, SheetContent, SheetTrigger, SheetTitle, SheetClose } from "src/components/ui/sheet"
import { signOut } from "next-auth/react"

export function AppNavbar() {
    const { data: session, status } = useSession()
    const isLoggedIn = status === "authenticated" && !!session

    return (
        <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur">
            <div className="px-4 md:px-12 flex h-14 items-center justify-between">
                <div className="flex items-center gap-6">
                    <Sheet>
                        <SheetTrigger asChild>
                            <Button variant="ghost" className="px-0 text-base hover:bg-transparent focus-visible:bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 md:hidden">
                                <Menu className="h-5 w-5" />
                                <span className="sr-only">Toggle Menu</span>
                            </Button>
                        </SheetTrigger>
                        <SheetContent side="left" className="w-75 sm:w-100">
                            <SheetTitle className="sr-only">Navigation Menu</SheetTitle>
                            <nav className="flex flex-col gap-4 mt-8">
                                <SheetClose asChild>
                                    <Link href="/" className="flex items-center gap-3 group w-fit">
                                        <div className="h-10 w-10 rounded-xl bg-zinc-950 dark:bg-white flex items-center justify-center transition-transform group-hover:rotate-3 shadow-lg">
                                            <ChefHat className="h-6 w-6 text-white dark:text-black" />
                                        </div>
                                        <span className="text-xl font-black italic tracking-tighter uppercase text-zinc-900 dark:text-white">
                                            Smart <span className="text-primary">Meal</span> Planner
                                        </span>
                                    </Link>
                                </SheetClose>

                                <SheetClose asChild>
                                    <Link href="/" className="flex items-center gap-2 text-sm font-medium mt-4">
                                        <Home className="h-4 w-4" /> Home
                                    </Link>
                                </SheetClose>

                                {isLoggedIn && (
                                    <>
                                        <SheetClose asChild>
                                            <Link href="/dashboard" className="text-sm font-medium">Dashboard</Link>
                                        </SheetClose>
                                        <SheetClose asChild>
                                            <Link href="/plan" className="text-sm font-medium">Meal Plan</Link>
                                        </SheetClose>
                                        <SheetClose asChild>
                                            <Link href="/shopping-list" className="text-sm font-medium">Shopping Lists</Link>
                                        </SheetClose>
                                        <SheetClose asChild>
                                            <Link href="/household" className="text-sm font-medium">Household</Link>
                                        </SheetClose>
                                        <SheetClose asChild>
                                            <Link href="/profile" className="text-sm font-medium text-muted-foreground">Profile</Link>
                                        </SheetClose>
                                    </>
                                )}

                                {!isLoggedIn ? (
                                    <SheetClose asChild>
                                        <Link href="/login" className="text-sm font-medium">Login</Link>
                                    </SheetClose>
                                ) : (
                                    <button
                                        onClick={() => signOut({ callbackUrl: "/login" })}
                                        className="text-sm font-medium text-left text-destructive"
                                    >
                                        Logout
                                    </button>
                                )}
                            </nav>
                        </SheetContent>
                    </Sheet>

                    <Link href="/" className="hidden items-center gap-3 group md:flex">
                        <div className="h-10 w-10 rounded-xl bg-zinc-950 dark:bg-white flex items-center justify-center transition-transform group-hover:rotate-3 shadow-lg">
                            <ChefHat className="h-6 w-6 text-white dark:text-black" />
                        </div>
                        <span className="text-2xl font-black italic tracking-tighter uppercase text-zinc-900 dark:text-white">
                            Smart <span className="text-primary">Meal</span> Planner
                        </span>
                    </Link>
                </div>

                <div className="flex items-center space-x-6">
                    {isLoggedIn ? (
                        <div className="hidden md:flex items-center space-x-6">
                            <Link href="/dashboard" className="text-base font-medium hover:text-primary transition-colors">
                                Dashboard
                            </Link>
                            <Link href="/plan" className="text-base font-medium hover:text-primary transition-colors">
                                Plan
                            </Link>
                            <Link href="/shopping-list" className="text-base font-medium hover:text-primary transition-colors">
                                Shopping Lists
                            </Link>
                            <Link href="/household" className="text-base font-medium hover:text-primary transition-colors">
                                Household
                            </Link>
                            <Link href="/profile" className="text-base font-medium text-muted-foreground hover:text-primary transition-colors">
                                Profile
                            </Link>
                        </div>
                    ) : null}

                    {!isLoggedIn ? (
                        <Button asChild size="sm">
                            <Link href="/login">Get Started</Link>
                        </Button>
                    ) : (
                        <Button variant="ghost" size="sm" onClick={() => signOut({ callbackUrl: "/login" })} className="gap-2">
                            <LogOut className="h-4 w-4" />
                            <span className="hidden sm:inline">Logout</span>
                        </Button>
                    )}
                </div>
            </div>
        </header>
    )
}
