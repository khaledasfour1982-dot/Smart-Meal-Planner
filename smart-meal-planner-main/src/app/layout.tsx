import "../styles/globals.css";

import { type Metadata } from "next";
import { Geist } from "next/font/google";

import { TRPCReactProvider } from "~/trpc/react";
import { HelpChat } from "~/app/_components/HelpChat";
import { AppNavbar } from "~/components/ui/app-nav";
import { BottomNav } from "~/components/ui/bottom-nav";
import { AppFooter } from "~/components/ui/app-footer";
import { getSession } from "~/server/auth";

export const metadata: Metadata = {
    title: "Smart Meal Planner",
    description: "AI-powered meal planning for busy families",
    icons: [{ rel: "icon", url: "/favicon.svg", type: "image/svg+xml" }],
};

const geist = Geist({
    subsets: ["latin"],
    variable: "--font-geist-sans",
});

export default async function RootLayout({
                                       children,
                                   }: Readonly<{ children: React.ReactNode }>) {
    const session = await getSession();

    return (
        <html lang="en" className={`${geist.variable}`}>
        <body className="min-h-screen flex flex-col bg-background antialiased" suppressHydrationWarning>
        <TRPCReactProvider>
            <AppNavbar/>
            <main className="flex-1 relative">
                {children}
            </main>
            <AppFooter />
            <BottomNav/>
            <HelpChat />
        </TRPCReactProvider>
        </body>
        </html>
    );
}
