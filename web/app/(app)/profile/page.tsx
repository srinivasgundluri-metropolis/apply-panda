import { PageHeader } from "@/components/layout/page-header";
import { ProfileResumeEditor } from "@/components/profile/profile-resume-editor";
import { readProfile } from "@/lib/profile";
import { readFile, access } from "node:fs/promises";
import { CV_PATH } from "@/lib/paths";

export const dynamic = "force-dynamic";

async function readCvMd(): Promise<string> {
  try {
    await access(CV_PATH);
    return await readFile(CV_PATH, "utf-8");
  } catch {
    return "";
  }
}

export default async function ProfilePage() {
  const [profile, cvMd] = await Promise.all([readProfile(), readCvMd()]);
  return (
    <>
      <PageHeader
        title="Profile & résumé"
        description="Edit targeting metadata (YAML) and your résumé narrative (cv.md). Updating both keeps tailored ATS + full-length CVs and cover letters aligned with your latest experience."
      />
      <div className="px-8 py-6 max-w-4xl">
        <ProfileResumeEditor initial={profile} initialCvMarkdown={cvMd} />
      </div>
    </>
  );
}
