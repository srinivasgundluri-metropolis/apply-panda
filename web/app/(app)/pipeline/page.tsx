import { PageHeader } from "@/components/layout/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PasteForm } from "@/components/pipeline/paste-form";
import { ScanRunner } from "@/components/pipeline/scan-runner";

export default function PipelinePage() {
  return (
    <>
      <PageHeader
        title="Pipeline"
        description="Paste a job description or URL to evaluate one role, or run an ATS board scan to pull fresh listings from the companies configured on your profile."
      />
      <div className="px-8 py-6">
        <Tabs defaultValue="paste" className="gap-6">
          <TabsList>
            <TabsTrigger value="paste">Paste JD or URL</TabsTrigger>
            <TabsTrigger value="scan">Scan job boards</TabsTrigger>
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
