import Link from "next/link";
import { Inbox } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApplicationsTable } from "@/components/tracker/applications-table";
import { JobActionCard } from "@/components/tracker/job-action-card";
import { Card, CardContent } from "@/components/ui/card";
import { readApplications } from "@/lib/parse-applications";
import { readProfile, candidateFullName } from "@/lib/profile";
import { candidateSlug } from "@/lib/slugify";

export const dynamic = "force-dynamic";

export default async function TrackerPage() {
  const profile = await readProfile();
  const slug = candidateSlug(candidateFullName(profile));
  const rows = await readApplications(slug);
  // Default the doc-actions list to "Evaluated" — the rows where the user
  // is most likely to need a tailored CV/CL next.
  const evalRows = rows.filter((r) => r.status === "Evaluated");

  return (
    <>
      <PageHeader
        title="Interactive Tracker"
        description="Edit row status inline, click Apply to open the posting, and generate tailored documents per role."
        actions={
          <Button asChild variant="outline">
            <Link href="/pipeline">
              <Inbox className="size-4" />
              Add new
            </Link>
          </Button>
        }
      />

      <div className="px-8 py-6">
        {rows.length === 0 ? (
          <Card>
            <CardContent className="px-6 py-16 text-center">
              <Inbox className="size-10 mx-auto text-muted-foreground mb-3" />
              <p className="font-medium mb-1">No applications yet</p>
              <p className="text-sm text-muted-foreground mb-4">
                Paste a JD on the Pipeline page, or run a scan to find offers.
              </p>
              <Button asChild>
                <Link href="/pipeline">Open Pipeline</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Tabs defaultValue="table" className="gap-6">
            <TabsList>
              <TabsTrigger value="table">Table view</TabsTrigger>
              <TabsTrigger value="cards">
                Tailored documents
                {evalRows.length > 0 ? (
                  <span className="ml-1.5 text-[10px] tabular-nums opacity-70">
                    {evalRows.length}
                  </span>
                ) : null}
              </TabsTrigger>
            </TabsList>
            <TabsContent value="table">
              <ApplicationsTable rows={rows} />
            </TabsContent>
            <TabsContent value="cards" className="flex flex-col gap-4">
              {evalRows.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No `Evaluated` rows. Score a job in Pipeline first.
                </p>
              ) : (
                evalRows.map((r) => (
                  <JobActionCard key={r.num} row={r} />
                ))
              )}
            </TabsContent>
          </Tabs>
        )}
      </div>
    </>
  );
}
