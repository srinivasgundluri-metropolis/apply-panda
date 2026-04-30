import Link from "next/link";

export const dynamic = "force-static";

export default function TermsPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12 space-y-6">
      <h1 className="text-3xl font-semibold tracking-tight">Terms of Service</h1>
      <p className="text-sm text-muted-foreground">
        Last updated: April 30, 2026
      </p>

      <section className="space-y-2">
        <h2 className="text-xl font-medium">1. Acceptance</h2>
        <p className="text-muted-foreground">
          By creating an account or using ApplyPanda, you agree to these Terms.
          If you do not agree, do not use the service.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-medium">2. Service scope</h2>
        <p className="text-muted-foreground">
          ApplyPanda helps users organize job-search workflows. You are
          responsible for reviewing content before applying or sharing it.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-medium">3. User responsibilities</h2>
        <p className="text-muted-foreground">
          You must provide accurate information, keep your credentials secure,
          and use the service lawfully. You may not use ApplyPanda to violate
          platform policies or applicable law.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-medium">4. Availability and changes</h2>
        <p className="text-muted-foreground">
          We may update, pause, or discontinue features, including temporary
          safety lock modes when required.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-medium">5. Limitation of liability</h2>
        <p className="text-muted-foreground">
          The service is provided &quot;as is&quot; without warranties. To the
          maximum extent allowed by law, we are not liable for indirect or
          consequential damages.
        </p>
      </section>

      <p className="text-sm text-muted-foreground">
        See also our <Link href="/privacy" className="underline">Privacy Policy</Link>.
      </p>
    </main>
  );
}

