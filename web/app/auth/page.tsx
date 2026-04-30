import { AuthForm } from "@/components/auth/auth-form";
import { LogoMark } from "@/components/branding/logo-mark";

export const dynamic = "force-dynamic";

export default async function AuthPage({
  searchParams,
}: {
  searchParams?: Promise<{ blocked?: string }>;
}) {
  const params = (await searchParams) ?? {};
  const blocked = params.blocked === "1";
  return (
    <div className="min-h-screen w-full grid place-items-center px-4">
      <div className="w-full max-w-md space-y-4">
        <div className="flex items-center justify-center gap-2">
          <LogoMark />
          <span className="font-semibold tracking-tight">ApplyPanda</span>
        </div>
        <AuthForm blocked={blocked} />
        <p className="text-center text-xs text-muted-foreground">
          By using ApplyPanda, you agree to our{" "}
          <a href="/terms" className="underline">
            Terms
          </a>{" "}
          and{" "}
          <a href="/privacy" className="underline">
            Privacy Policy
          </a>
          {" "}and{" "}
          <a href="/attribution" className="underline">
            Attribution
          </a>
          .
        </p>
      </div>
    </div>
  );
}

