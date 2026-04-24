import { ChatView } from "@/components/chat/ChatView";

export const metadata = {
  title: "Chat — Mission Control",
  description: "Chat with your AI agents",
};

export default function ChatPage() {
  return (
    <main className="flex flex-1 flex-col overflow-hidden">
      <ChatView isVisible={true} />
    </main>
  );
}