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
        title="Scan Results"
        description="Every job the portal scanner has surfaced. Filter, click ⚡ to evaluate inline, and the row's status flips to Evaluated automatically."
        actions={
          <Button asChild variant="outline">
            <Link href="/pipeline">
              <Search className="size-4" />
              Run scan
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
              <p className="text-sm text-muted-foreground mb-4">
                Run a portal scan from the Pipeline page to populate this view.
              </p>
              <Button asChild>
                <Link href="/pipeline">Open Pipeline</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <ScanTable rows={rows} portals={portals} />
        )}
      </div>
    </>
  );
}
