import Link from "next/link";
import { Search } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ScanTable } from "@/components/scan-results/scan-table";
import { readScanHistory } from "@/lib/scan-history";

export const dynamic = "force-dynamic";

export default async function ScanResultsPage() {
  const rows = await readScanHistory();
  const portals = Array.from(new Set(rows.map((r) => r.portal))).sort();

  return (
    <>
      <PageHeader
        title="Scan results"
        description="Jobs discovered from your ATS board scan. Filter the table, use ⚡ Evaluate on a row, and status updates when a report is saved."
        actions={
          <Button asChild variant="outline">
            <Link href="/pipeline">
              <Search className="size-4" />
              Scan job boards
            </Link>
          </Button>
        }
      />
      <div className="px-8 py-6">
        {rows.length === 0 ? (
          <Card>
            <CardContent className="px-6 py-16 text-center">
              <Search className="size-10 mx-auto text-muted-foreground mb-3" />
              <p className="font-medium mb-1">Scan history is empty</p>
              <p className="text-sm text-muted-foreground mb-4 max-w-md mx-auto">
                Configure companies under{" "}
                <Link href="/profile?tab=boards" className="underline underline-offset-2 font-medium">
                  Profile → ATS job boards
                </Link>
                , then run <strong>Scan job boards</strong> from Pipeline.
              </p>
              <div className="flex flex-wrap gap-2 justify-center">
                <Button asChild>
                  <Link href="/profile?tab=boards">Configure boards</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href="/pipeline">Open Pipeline</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <ScanTable rows={rows} portals={portals} />
        )}
      </div>
    </>
  );
}
