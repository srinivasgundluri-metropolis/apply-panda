import { PageHeader } from "@/components/layout/page-header";
import { ChatPanel } from "@/components/chat/chat-panel";
import { readProfile, candidateFirstName } from "@/lib/profile";

export const dynamic = "force-dynamic";

export default async function ChatPage() {
  const profile = await readProfile();
  const first = candidateFirstName(profile);

  return (
    <>
      <PageHeader
        title="AI Chat"
        description="Ask about jobs on LinkedIn (guest search), your tracker and reports, or your profile—with optional résumé coach to persist edits. Inline evaluation runs when jobs are listed."
      />
      <div className="px-8 py-6 flex-1 min-h-0 flex flex-col">
        <ChatPanel
          candidateFirst={first}
          profileLocationHint={
            profile.candidate?.location?.trim() || undefined
          }
        />
      </div>
    </>
  );
}
