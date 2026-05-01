import Link from "next/link";
import { TERMS_SECTIONS, TERMS_VERSION } from "@/lib/legal";

export const dynamic = "force-static";

export default function TermsPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12 space-y-6">
      <h1 className="text-3xl font-semibold tracking-tight">Terms of Service</h1>
      <p className="text-sm text-muted-foreground">
        Effective version: {TERMS_VERSION}
      </p>

      {TERMS_SECTIONS.map((section) => (
        <section key={section.title} className="space-y-2">
          <h2 className="text-xl font-medium">{section.title}</h2>
          <p className="text-muted-foreground">{section.body}</p>
        </section>
      ))}

      <p className="text-sm text-muted-foreground">
        See also our{" "}
        <Link href="/privacy" className="underline">
          Privacy Policy
        </Link>{" "}
        and{" "}
        <Link href="/attribution" className="underline">
          Attribution
        </Link>
        .
      </p>
    </main>
  );
}

