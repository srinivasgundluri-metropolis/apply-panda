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
        description="Conversational help for job hunts, tracker, and profile—with live LinkedIn + ATS rows injected on the server when your message reads like a job search. Résumé coach can persist edits."
      />
      <div className="px-8 py-6 flex-1 min-h-0 flex flex-col">
        <ChatPanel candidateFirst={first} />
      </div>
    </>
  );
}
