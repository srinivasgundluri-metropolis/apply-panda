import { readdir, stat, access, readFile } from "node:fs/promises";
import { join, relative, basename } from "node:path";
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
import { OUTPUT_DIR, COVER_LETTERS_DIR, REPO_ROOT, CV_PATH } from "@/lib/paths";
import { formatDate } from "@/lib/utils";
import { apiFileHref } from "@/lib/file-serving";

export const dynamic = "force-dynamic";

interface OutputFile {
  name: string;
  relPath: string;
  size: number;
  mtime: number;
}

async function exists(p: string): Promise<boolean> {
  return access(p).then(
    () => true,
    () => false,
  );
}

async function listPdfs(dir: string): Promise<OutputFile[]> {
  if (!(await exists(dir))) return [];
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }
  const out: OutputFile[] = [];
  for (const name of entries) {
    if (!name.endsWith(".pdf")) continue;
    const path = join(dir, name);
    try {
      const s = await stat(path);
      if (!s.isFile()) continue;
      out.push({
        name,
        relPath: relative(REPO_ROOT, path),
        size: s.size,
        mtime: s.mtimeMs,
      });
    } catch {
      // skip
    }
  }
  out.sort((a, b) => b.mtime - a.mtime);
  return out;
}

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

export default async function DocumentsPage() {
  const [cvs, cls] = await Promise.all([
    listPdfs(OUTPUT_DIR),
    listPdfs(COVER_LETTERS_DIR),
  ]);
  const cvMd = (await exists(CV_PATH))
    ? await readFile(CV_PATH, "utf-8")
    : "";

  return (
    <>
      <PageHeader
        title="CVs & Documents"
        description="Every tailored CV and cover letter that the agent has generated, plus your master CV markdown."
      />

      <div className="px-8 py-6">
        <Tabs defaultValue="generated" className="gap-6">
          <TabsList>
            <TabsTrigger value="generated">
              Generated PDFs
              <span className="ml-1.5 text-[10px] opacity-70">
                {cvs.length + cls.length}
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
              empty="No cover letters yet — generate one from the Tracker."
            />
          </TabsContent>

          <TabsContent value="cv-md">
            <Card>
              <CardContent className="px-6 py-6">
                {cvMd ? (
                  <Markdown content={cvMd} />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No <code>cv.md</code> in the repo root. Add one at{" "}
                    <code>{CV_PATH}</code> and refresh.
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
