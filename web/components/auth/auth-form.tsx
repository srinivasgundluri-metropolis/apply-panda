"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type Mode = "signin" | "signup";

export function AuthForm({ blocked = false }: { blocked?: boolean }) {
  const router = useRouter();
  const [mode, setMode] = React.useState<Mode>("signin");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [fullName, setFullName] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [acceptedTerms, setAcceptedTerms] = React.useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) return;
    if (mode === "signup" && !acceptedTerms) {
      setError("You must accept the Terms and Privacy Policy to sign up.");
      return;
    }
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const allowRes = await fetch("/api/auth/allowlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const allowJson = await allowRes.json().catch(() => ({}));
      if (!allowRes.ok) {
        throw new Error(allowJson.error ?? "Could not verify email access.");
      }
      if (!allowJson.allowed) {
        throw new Error(
          "Access is currently limited to approved email addresses only.",
        );
      }

      const supabase = createSupabaseBrowserClient();
      if (mode === "signup") {
        const { error: signErr } = await supabase.auth.signUp({
          email: email.trim(),
          password: password.trim(),
          options: {
            data: {
              full_name: fullName.trim() || undefined,
              terms_accepted: true,
              terms_version: "2026-04-30",
              terms_accepted_at: new Date().toISOString(),
            },
          },
        });
        if (signErr) throw signErr;
        setNotice(
          "Account created. If email confirmation is enabled, check your inbox; otherwise sign in now.",
        );
        setMode("signin");
      } else {
        const { error: signErr } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password: password.trim(),
        });
        if (signErr) throw signErr;
        router.push("/dashboard");
        router.refresh();
      }
    } catch (err) {
      setError((err as Error).message || "Authentication failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Welcome to ApplyPanda</CardTitle>
        <CardDescription>Sign in to access your private workspace.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {blocked ? (
          <p className="text-sm text-destructive">
            Access is currently restricted for this account. Contact support if
            you believe this is a mistake.
          </p>
        ) : null}
        <Tabs
          value={mode}
          onValueChange={(v) => setMode(v as Mode)}
          className="w-full"
        >
          <TabsList className="w-full">
            <TabsTrigger value="signin">Sign in</TabsTrigger>
            <TabsTrigger value="signup">Sign up</TabsTrigger>
          </TabsList>
        </Tabs>

        <form onSubmit={onSubmit} className="space-y-3">
          {mode === "signup" ? (
            <div className="space-y-1.5">
              <Label htmlFor="full-name">Full name</Label>
              <Input
                id="full-name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Jane Doe"
                disabled={loading}
              />
            </div>
          ) : null}
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              disabled={loading}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              disabled={loading}
              required
            />
          </div>
          {mode === "signup" ? (
            <label className="flex items-start gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                className="mt-0.5 size-4 rounded border-input"
                checked={acceptedTerms}
                onChange={(e) => setAcceptedTerms(e.target.checked)}
                disabled={loading}
                required
              />
              <span>
                I agree to the{" "}
                <Link href="/terms" className="underline" target="_blank">
                  Terms of Service
                </Link>{" "}
                and{" "}
                <Link href="/privacy" className="underline" target="_blank">
                  Privacy Policy
                </Link>
                .
              </span>
            </label>
          ) : null}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Please wait
              </>
            ) : mode === "signin" ? (
              "Sign in"
            ) : (
              "Create account"
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

