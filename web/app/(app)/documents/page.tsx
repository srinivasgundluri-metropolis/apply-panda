import { basename } from "node:path";
import { Download, FileText, Mail, Folder } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Markdown } from "@/components/chat/markdown";
import { formatDate } from "@/lib/utils";
import { apiFileHref } from "@/lib/file-serving";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

interface OutputFile {
  name: string;
  relPath: string;
  size: number;
  mtime: number;
  kind?: string;
}

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

export default async function DocumentsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let cvs: OutputFile[] = [];
  let cls: OutputFile[] = [];
  let drafts: OutputFile[] = [];
  let cvMd = "";
  if (user) {
    const [{ data: docs }, { data: resume }] = await Promise.all([
      supabase
        .from("documents")
        .select("name,storage_path,size,mtime,kind")
        .eq("user_id", user.id)
        .order("mtime", { ascending: false }),
      supabase
        .from("resumes")
        .select("content_md")
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);
    cvMd = String(resume?.content_md ?? "");
    const all = (docs ?? []).map((d: Record<string, unknown>) => ({
      name: String(d.name ?? ""),
      relPath: String(d.storage_path ?? ""),
      size: Number(d.size ?? 0),
      mtime: Number(d.mtime ?? 0),
      kind: String(d.kind ?? "other"),
    }));
    cvs = all.filter((f) => f.kind === "cv");
    cls = all.filter((f) => f.kind === "cl");
    drafts = all.filter((f) => f.kind === "draft");
  }

  return (
    <>
      <PageHeader
        title="CVs & Documents"
        description="Tailored CVs and cover letters from the Tracker are rendered to one-page PDFs (Letter) when Chromium is available, with printable HTML as fallback. Older Markdown-only runs may appear under drafts. Your master résumé is in the cv.md tab."
      />

      <div className="px-8 py-6">
        <Tabs defaultValue="generated" className="gap-6">
          <TabsList>
            <TabsTrigger value="generated">
              Generated files
              <span className="ml-1.5 text-[10px] opacity-70">
                {cvs.length + cls.length + drafts.length}
              </span>
            </TabsTrigger>
            <TabsTrigger value="cv-md">cv.md</TabsTrigger>
          </TabsList>

          <TabsContent value="generated" className="flex flex-col gap-6">
            <DocSection
              title="Tailored CVs"
              icon={FileText}
              files={cvs}
              empty="No CVs yet — generate one from the Tracker."
            />
            <DocSection
              title="Cover Letters"
              icon={Mail}
              files={cls}
              empty="No cover letters yet — generate from the Tracker (PDF or HTML fallback)."
            />
            <DocSection
              title="Markdown drafts (Tailored docs)"
              icon={FileText}
              files={drafts}
              empty="No drafts yet — open **Tracker → Tailored documents**, run Generate, and wait for the stream to finish (we save the model output as Markdown)."
            />
          </TabsContent>

          <TabsContent value="cv-md">
            <Card>
              <CardContent className="px-6 py-6">
                {cvMd ? (
                  <Markdown content={cvMd} />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No canonical resume found yet. Upload/edit your resume in the
                    profile coach and refresh.
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}

interface DocSectionProps {
  title: string;
  icon: typeof FileText;
  files: OutputFile[];
  empty: string;
}

function DocSection({ title, icon: Icon, files, empty }: DocSectionProps) {
  return (
    <section>
      <h2 className="text-lg font-semibold flex items-center gap-2 mb-3">
        <Icon className="size-4 text-primary" />
        {title}
        <Badge variant="outline" className="text-[10px]">
          {files.length}
        </Badge>
      </h2>
      {files.length === 0 ? (
        <Card>
          <CardContent className="px-6 py-8 text-center text-sm text-muted-foreground">
            <Folder className="size-8 mx-auto mb-2 opacity-50" />
            {empty}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {files.map((f) => (
            <Card key={f.relPath} className="px-4 py-4 gap-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p
                    className="text-sm font-medium truncate"
                    title={f.name}
                  >
                    {basename(f.name).replace(/\.pdf$/i, "")}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {formatBytes(f.size)} · {formatDate(new Date(f.mtime))}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1 mt-1">
                <Button asChild size="sm" variant="default" className="flex-1">
                  <a
                    href={apiFileHref(f.relPath)!}
                    download
                  >
                    <Download className="size-3.5" />
                    Download
                  </a>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <a
                    href={apiFileHref(f.relPath)!}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open
                  </a>
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}
