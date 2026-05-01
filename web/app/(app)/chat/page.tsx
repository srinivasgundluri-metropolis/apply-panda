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
        description="Profile, résumé, evaluations, tracker, applications, and strategy. Each reply includes your hosted résumé for context; explicit “update my cv.md …” lines (or résumé coach mode) persist edits. Job discovery: Pipeline scan."
      />
      <div className="px-8 py-6 flex-1 min-h-0 flex flex-col">
        <ChatPanel candidateFirst={first} />
      </div>
    </>
  );
}
