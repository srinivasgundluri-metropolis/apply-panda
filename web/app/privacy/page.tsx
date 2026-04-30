import Link from "next/link";

export const dynamic = "force-static";

export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12 space-y-6">
      <h1 className="text-3xl font-semibold tracking-tight">Privacy Policy</h1>
      <p className="text-sm text-muted-foreground">
        Last updated: April 30, 2026
      </p>

      <section className="space-y-2">
        <h2 className="text-xl font-medium">1. Data we process</h2>
        <p className="text-muted-foreground">
          We process account details (such as email), user-provided profile and
          resume content, and generated artifacts needed to provide the service.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-medium">2. How data is used</h2>
        <p className="text-muted-foreground">
          Data is used to authenticate users, isolate tenant records, and run
          requested product workflows.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-medium">3. Security controls</h2>
        <p className="text-muted-foreground">
          We apply authenticated access controls, row-level isolation, and
          deployment safety checks. No system can promise absolute security.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-medium">4. Retention and deletion</h2>
        <p className="text-muted-foreground">
          Data is retained while your account is active. Contact support to
          request deletion where required.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-medium">5. Policy updates</h2>
        <p className="text-muted-foreground">
          We may update this policy. Material changes will be reflected by the
          updated date.
        </p>
      </section>

      <p className="text-sm text-muted-foreground">
        Review our <Link href="/terms" className="underline">Terms of Service</Link>.
      </p>
    </main>
  );
}

