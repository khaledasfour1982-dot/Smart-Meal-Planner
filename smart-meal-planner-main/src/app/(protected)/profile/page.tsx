"use client";

import { useState } from "react";
import { api } from "~/trpc/react";
import { Card, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { ShieldIcon, UserIcon, DatabaseIcon, ChefHat, Settings, Loader2, AlertTriangle, CheckCircle2, ArrowRight, Lock } from "lucide-react";
import Link from "next/link";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { signOut } from "next-auth/react";
import { cn } from "~/lib/utils";

export default function ProfilePage() {
  const utils = api.useUtils();
  const { data: userProfile, isLoading: profileLoading } = api.user.getProfile.useQuery();
  
  // Profile State
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [updateStatus, setUpdateStatus] = useState<"idle" | "loading" | "success" | "error">("idle");

  // Security State
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordStep, setPasswordStep] = useState<"current" | "new">("current");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [securityError, setSecurityError] = useState("");

  // Mutations
  const updateProfile = api.user.updateProfile.useMutation({
    onSuccess: async () => {
      await utils.user.getProfile.invalidate();
      setUpdateStatus("success");
      setTimeout(() => {
        setUpdateStatus("idle");
        setIsEditing(false);
      }, 2000);
    },
    onError: () => setUpdateStatus("error"),
  });

  const verifyPassword = api.user.verifyCurrentPassword.useMutation();
  const updatePassword = api.user.updatePassword.useMutation();

  const deleteAccount = api.user.deleteAccount.useMutation({
    onSuccess: () => {
      void signOut({ callbackUrl: "/login" });
    },
  });

  // Handlers
  const handleUpdate = () => {
    setUpdateStatus("loading");
    updateProfile.mutate({ 
      name: name || undefined, 
      email: email || undefined 
    });
  };

  const handlePasswordReset = async () => {
    setSecurityError("");
    
    if (passwordStep === "current") {
      setUpdateStatus("loading");
      try {
        const res = await verifyPassword.mutateAsync({ password: currentPassword });
        if (res.isValid) {
          setPasswordStep("new");
          setUpdateStatus("idle");
        } else {
          setSecurityError("Incorrect current password.");
          setUpdateStatus("idle");
        }
      } catch {
        setSecurityError("An error occurred. Please try again.");
        setUpdateStatus("idle");
      }
    } 
    else if (passwordStep === "new") {
      if (!newPassword) {
        setSecurityError("Please enter a new password.");
        return;
      }
      if (newPassword !== confirmPassword) {
        setSecurityError("Passwords do not match.");
        return;
      }
      setUpdateStatus("loading");
      await updatePassword.mutateAsync({ newPassword });
      setUpdateStatus("success");
      setTimeout(() => {
        setUpdateStatus("idle");
        setIsChangingPassword(false);
        setPasswordStep("current");
        setNewPassword("");
        setConfirmPassword("");
        setCurrentPassword("");
      }, 2000);
    }
  };

  const handleDelete = () => {
    if (confirm("CRITICAL ACTION: Are you sure you want to PERMANENTLY delete your account? This action cannot be undone.")) {
      deleteAccount.mutate();
    }
  };

  if (profileLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <div className="relative h-64 w-full md:h-[450px] overflow-hidden bg-zinc-950">
        <img 
          src="/images/auth/login-bg.jpg" 
          alt="Profile Background"
          className="h-full w-full object-cover opacity-80"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-black/40" />
        
        <div className="absolute inset-0 flex items-end justify-start p-6 pb-24 md:p-12 md:pb-32">
          <div className="container mx-auto max-w-4xl">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-black px-4 py-1.5 text-[9px] md:text-[10px] font-black text-white uppercase tracking-[0.2em] shadow-2xl ring-1 ring-white/20">
              <Settings className="h-3.5 w-3.5" />
              <span>User Account</span>
            </div>
            <h1 className="text-3xl font-black tracking-tighter text-white sm:text-7xl uppercase italic drop-shadow-2xl">
              My Profile
            </h1>
          </div>
        </div>
      </div>

      <div className="container mx-auto max-w-4xl px-4 -mt-16 md:-mt-32 relative z-20 space-y-6">
        
        <div className="group p-5 md:p-8 bg-white rounded-[40px] border border-white/10 shadow-[0_32px_64px_-15px_rgba(0,0,0,0.2)] flex flex-col md:flex-row gap-6 items-center transition-all hover:scale-[1.01]">
          <div className="h-14 w-14 rounded-2xl bg-zinc-950 flex items-center justify-center shadow-2xl shrink-0 group-hover:rotate-3 transition-transform">
            <ChefHat className="w-8 h-8 text-white" />
          </div>
          <div className="text-center md:text-left flex-1">
            <h3 className="text-xl md:text-2xl font-black tracking-tight uppercase mb-1">Looking for household config?</h3>
            <p className="text-muted-foreground font-medium text-xs md:text-sm leading-relaxed">
              Family size, dietary needs, and allergens have moved to the <span className="text-zinc-950 font-black">Household</span> tab.
            </p>
          </div>
          <Button asChild className="rounded-2xl h-12 px-8 font-black shadow-xl bg-zinc-950 hover:bg-zinc-800 text-xs" variant="default">
            <Link href="/household">GO TO HOUSEHOLD</Link>
          </Button>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Account Information */}
          <Card className={cn(
            "rounded-[40px] border-none shadow-xl bg-card overflow-hidden transition-all",
            isEditing ? "md:col-span-2 ring-2 ring-primary" : "group hover:scale-[1.01]"
          )}>
            <CardHeader className="pb-4 p-6 md:p-8">
              <div className="flex items-center justify-between mb-4">
                <div className="h-10 w-10 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
                  <UserIcon className="w-5 h-5 text-zinc-500" />
                </div>
                {!isEditing ? (
                  <Button variant="outline" size="sm" onClick={() => { setIsEditing(true); setName(userProfile?.name ?? ""); setEmail(userProfile?.email ?? ""); }} className="font-black text-[8px] uppercase tracking-widest border-zinc-200 px-3 h-8">Edit Profile</Button>
                ) : (
                  <Badge variant="secondary" className="bg-primary/10 text-primary border-none px-2 py-0.5 font-black text-[8px] uppercase">Editing Mode</Badge>
                )}
              </div>
              
              {!isEditing ? (
                <>
                  <CardTitle className="text-xl md:text-2xl font-black tracking-tighter uppercase italic mb-1">{userProfile?.name || "No Name Set"}</CardTitle>
                  <CardDescription className="font-bold text-sm md:text-base text-zinc-900 dark:text-white flex items-center gap-2 mb-3">
                    {userProfile?.email}
                  </CardDescription>
                  <p className="text-muted-foreground font-medium text-[11px] md:text-xs leading-relaxed">
                    Personalized identity used for your meal plans.
                  </p>
                </>
              ) : (
                <div className="space-y-4 pt-1">
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label className="font-black uppercase text-[8px] md:text-[9px] tracking-widest text-muted-foreground">Full Name</Label>
                      <Input value={name} onChange={(e) => setName(e.target.value)} className="h-10 rounded-xl font-bold text-sm" placeholder="Your name" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="font-black uppercase text-[8px] md:text-[9px] tracking-widest text-muted-foreground">Email Address</Label>
                      <Input value={email} onChange={(e) => setEmail(e.target.value)} className="h-10 rounded-xl font-bold text-sm" placeholder="Your email" />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={handleUpdate} disabled={updateStatus === "loading"} className="h-10 px-6 rounded-xl font-black uppercase tracking-widest bg-zinc-950 text-white flex gap-2 text-xs">
                      {updateStatus === "loading" ? <Loader2 className="h-3 w-3 animate-spin" /> : updateStatus === "success" ? <CheckCircle2 className="h-3 w-3 text-emerald-400" /> : null}
                      {updateStatus === "success" ? "Updated!" : "Save"}
                    </Button>
                    <Button variant="ghost" onClick={() => setIsEditing(false)} className="h-10 px-6 rounded-xl font-black uppercase tracking-widest text-xs">Cancel</Button>
                  </div>
                </div>
              )}
            </CardHeader>
          </Card>

          {/* Security */}
          <Card className={cn(
            "rounded-[40px] border-none shadow-xl bg-card overflow-hidden transition-all",
            isChangingPassword ? "md:col-span-2 ring-2 ring-zinc-900" : "group hover:scale-[1.01]"
          )}>
            <CardHeader className="pb-4 p-6 md:p-8">
              <div className="flex items-center justify-between mb-4">
                <div className="h-10 w-10 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
                  <ShieldIcon className="w-5 h-5 text-zinc-500" />
                </div>
                {!isChangingPassword ? (
                  <Button variant="outline" size="sm" onClick={() => setIsChangingPassword(true)} className="font-black text-[8px] uppercase tracking-widest border-zinc-200 px-3 h-8">Change Password</Button>
                ) : (
                  <Badge className="bg-zinc-950 text-white border-none px-2 py-0.5 font-black text-[8px] uppercase tracking-tighter">Security Protocol</Badge>
                )}
              </div>

              {!isChangingPassword ? (
                <>
                  <CardTitle className="text-xl md:text-2xl font-black tracking-tighter uppercase italic mb-1">Security</CardTitle>
                  <CardDescription className="font-medium text-xs md:text-sm leading-relaxed text-muted-foreground/80 mb-3">
                    Manage authentication and data encryption.
                  </CardDescription>
                  <div className="flex items-center gap-2 text-[8px] md:text-[9px] font-black uppercase text-emerald-600 bg-emerald-50 w-fit px-2.5 py-1 rounded-full border border-emerald-100">
                    <Lock className="w-2.5 h-2.5" />
                    Protected
                  </div>
                </>
              ) : (
                <div className="space-y-6 py-1">
                  <div className="max-w-xl">
                    <h3 className="text-xl md:text-2xl font-black uppercase italic tracking-tighter mb-1">Update Password</h3>
                    <p className="text-muted-foreground font-medium text-xs">Verify your identity.</p>
                  </div>

                  <div className="max-w-md space-y-4">
                    <div className="space-y-3">
                      {passwordStep === "current" && (
                        <div className="space-y-1.5">
                          <Label className="font-black uppercase text-[8px] md:text-[9px] tracking-widest">Current Password</Label>
                          <Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className="h-12 rounded-xl font-bold text-sm" placeholder="••••••••" />
                        </div>
                      )}
                      {passwordStep === "new" && (
                        <div className="grid gap-3">
                          <div className="space-y-1.5">
                            <Label className="font-black uppercase text-[8px] md:text-[9px] tracking-widest text-emerald-600">New Password</Label>
                            <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="h-12 rounded-xl font-bold border-emerald-100 text-sm" placeholder="Min. 8 chars" />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="font-black uppercase text-[8px] md:text-[9px] tracking-widest text-emerald-600">Confirm</Label>
                            <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="h-12 rounded-xl font-bold border-emerald-100 text-sm" placeholder="Re-enter" />
                          </div>
                        </div>
                      )}
                      {securityError && <p className="text-[8px] md:text-[9px] font-black text-destructive uppercase tracking-tight flex items-center gap-1"><AlertTriangle className="w-2.5 h-2.5" /> {securityError}</p>}
                    </div>

                    <div className="flex gap-2">
                      <Button onClick={handlePasswordReset} disabled={updateStatus === "loading"} className="h-12 px-6 rounded-xl font-black uppercase tracking-widest bg-zinc-950 text-white flex gap-2 flex-1 text-xs">
                        {updateStatus === "loading" ? <Loader2 className="h-3 w-3 animate-spin" /> : updateStatus === "success" ? <CheckCircle2 className="h-3 w-3 text-emerald-400" /> : <ArrowRight className="h-3 w-3" />}
                        {updateStatus === "success" ? "Done!" : passwordStep === "new" ? "Update" : "Verify"}
                      </Button>
                      <Button variant="ghost" onClick={() => { setIsChangingPassword(false); setPasswordStep("current"); setSecurityError(""); }} className="h-12 px-6 rounded-xl font-black uppercase tracking-widest text-xs">Cancel</Button>
                    </div>
                  </div>
                </div>
              )}
            </CardHeader>
          </Card>

          {/* Privacy & Data */}
          <Link href="/privacy" className="group block">
            <Card className="rounded-[40px] border-none shadow-xl bg-card overflow-hidden transition-all group-hover:scale-[1.01] group-hover:ring-4 group-hover:ring-zinc-950/5">
              <CardHeader className="pb-4 p-6 md:p-8">
                <div className="flex items-center justify-between mb-4">
                  <div className="h-10 w-10 rounded-xl bg-zinc-950 flex items-center justify-center">
                    <DatabaseIcon className="w-5 h-5 text-white" />
                  </div>
                  <Badge variant="secondary" className="font-black text-[8px] uppercase tracking-widest bg-zinc-950 text-white border-none px-2 py-0.5 shadow-md">Active</Badge>
                </div>
                <CardTitle className="text-xl md:text-2xl font-black tracking-tighter uppercase italic mb-1">Privacy & Data</CardTitle>
                <CardDescription className="font-medium text-xs md:text-sm leading-relaxed text-muted-foreground/80">
                  Consent and data management.
                </CardDescription>
              </CardHeader>
            </Card>
          </Link>

          {/* Danger Zone */}
          <Card className="rounded-[40px] border-none shadow-xl bg-card overflow-hidden group hover:scale-[1.01] transition-all">
            <CardHeader className="pb-4 p-6 md:p-8">
              <div className="flex items-center justify-between mb-4">
                <div className="h-10 w-10 rounded-xl bg-destructive/10 flex items-center justify-center text-destructive">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <Badge variant="destructive" className="font-black text-[8px] uppercase tracking-widest px-2 py-0.5 shadow-sm">Critical</Badge>
              </div>
              <CardTitle className="text-xl md:text-2xl font-black tracking-tighter uppercase italic text-destructive mb-1">Danger zone</CardTitle>
              <CardDescription className="font-medium text-[11px] md:text-xs leading-relaxed text-destructive/80 mb-4">
                Permanently delete account. Irreversible.
              </CardDescription>
              <Button onClick={handleDelete} disabled={deleteAccount.isPending} variant="destructive" className="w-full h-12 rounded-xl font-black uppercase tracking-tighter text-xs shadow-lg shadow-destructive/10 hover:scale-[1.01] transition-transform">
                {deleteAccount.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "DELETE ACCOUNT"}
              </Button>
            </CardHeader>
          </Card>
        </div>
      </div>
    </div>
  );
}
