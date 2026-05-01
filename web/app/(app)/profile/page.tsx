import { PageHeader } from "@/components/layout/page-header";
import { ProfileResumeEditor } from "@/components/profile/profile-resume-editor";
import { readProfile } from "@/lib/profile";
import { requireUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

async function readCvMd(): Promise<string> {
  try {
    const { supabase, user } = await requireUser();
    const { data, error } = await supabase
      .from("resumes")
      .select("content_md")
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) throw error;
    return String(data?.content_md ?? "");
  } catch {
    return "";
  }
}

export default async function ProfilePage({
  searchParams,
}: {
  searchParams?: Promise<{ tab?: string }>;
}) {
  const tab = (searchParams ? await searchParams : {}).tab;
  const defaultTab =
    tab === "yaml" || tab === "targeting" || tab === "boards" || tab === "portals"
      ? ("yaml" as const)
      : ("resume" as const);

  const [profile, cvMd] = await Promise.all([readProfile(), readCvMd()]);
  return (
    <>
      <PageHeader
        title="Profile & résumé"
        description="Edit targeting and résumé. ATS scans use your target roles, archetypes, and candidate location against the product’s built-in board catalog."
      />
      <div className="px-8 py-6 max-w-4xl">
        <ProfileResumeEditor
          initial={profile}
          initialCvMarkdown={cvMd}
          defaultTab={defaultTab}
        />
      </div>
    </>
  );
}
