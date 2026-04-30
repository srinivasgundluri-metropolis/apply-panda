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
        description="Talk to your career-ops assistant. It can search LinkedIn, query your local data, and trigger inline evaluations — without ever editing your files unless you ask."
      />
      <div className="px-8 py-6 flex-1 min-h-0 flex flex-col">
        <ChatPanel candidateFirst={first} />
      </div>
    </>
  );
}
