import { PageHeader } from "@/components/layout/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PasteForm } from "@/components/pipeline/paste-form";
import { ScanRunner } from "@/components/pipeline/scan-runner";

export default function PipelinePage() {
  return (
    <>
      <PageHeader
        title="Pipeline"
        description="Two ways to feed the system: paste a JD / URL for a single evaluation, or trigger a portal scan to surface fresh offers."
      />
      <div className="px-8 py-6">
        <Tabs defaultValue="paste" className="gap-6">
          <TabsList>
            <TabsTrigger value="paste">Paste JD or URL</TabsTrigger>
            <TabsTrigger value="scan">Scan portals</TabsTrigger>
          </TabsList>
          <TabsContent value="paste">
            <PasteForm />
          </TabsContent>
          <TabsContent value="scan">
            <ScanRunner />
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}
