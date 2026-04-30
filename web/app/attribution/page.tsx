import Link from "next/link";

export const dynamic = "force-static";

export default function AttributionPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12 space-y-6">
      <h1 className="text-3xl font-semibold tracking-tight">Attribution</h1>
      <p className="text-muted-foreground">
        ApplyPanda includes and adapts work from{" "}
        <a
          href="https://github.com/santifer/career-ops"
          className="underline"
          target="_blank"
          rel="noopener noreferrer"
        >
          santifer/career-ops
        </a>{" "}
        under the MIT License.
      </p>
      <p className="text-muted-foreground">
        Attribution and license details are documented in this repository&apos;s
        NOTICE and LICENSE files.
      </p>
      <p className="text-sm text-muted-foreground">
        See also{" "}
        <Link href="/terms" className="underline">
          Terms of Service
        </Link>{" "}
        and{" "}
        <Link href="/privacy" className="underline">
          Privacy Policy
        </Link>
        .
      </p>
    </main>
  );
}

