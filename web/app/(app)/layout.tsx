import { redirect } from "next/navigation";
import { readProfile, candidateFullName, candidateInitials } from "@/lib/profile";
import { Sidebar } from "@/components/layout/sidebar";
import { requireUser } from "@/lib/supabase/server";

/**
 * Layout for every page that has the sidebar (everything except the
 * marketing landing page). Pulls the candidate's name + initials at
 * request time so the sidebar header always shows the freshest profile.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = await requireUser().catch(() => ({ user: null }));
  if (!user) redirect("/auth");

  const profile = await readProfile();
  const fullName = candidateFullName(profile) || user.user_metadata?.full_name || user.email || "";
  const initials = candidateInitials(profile);
  const location = (profile.candidate?.location ?? "").trim();
  const email = (profile.candidate?.email ?? "").trim() || user.email || "";

  return (
    <div className="flex min-h-screen w-full">
      <Sidebar
        candidateName={fullName}
        candidateInitials={initials}
        candidateLocation={location}
        candidateEmail={email}
      />
      <main className="flex-1 min-w-0 flex flex-col">{children}</main>
    </div>
  );
}
