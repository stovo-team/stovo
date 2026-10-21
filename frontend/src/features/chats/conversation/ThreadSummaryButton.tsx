import { useEffect, useState } from "react";
import { ChevronRight, MessageCircle } from "lucide-react";
import { getMessages, type Chat, type Message } from "../../../api/chats";
import { useStrings } from "../../../i18n/LanguageContext";
import { RealAvatar } from "../sidebar/RealAvatar";

type Commenter = { id: string; name: string };
const summaries = new Map<string, { count: number; users: Commenter[] }>();
function commenters(messages: Message[], rootId: string) {
  return [...new Map(messages.filter((item) => item.threadRootMessageId === rootId && !item.deletedAt)
    .map((item) => [item.senderId, { id: item.senderId, name: item.senderDisplayName ?? "?" }])).values()];
}

export function ThreadSummaryButton({ message, messages, chat, count, currentUserId, accessToken, onOpen }: {
  message: Message; messages: Message[]; chat: Chat; count: number;
  currentUserId: string | null | undefined; accessToken: string | null; onOpen: () => void;
}) {
  const strings = useStrings();
  const key = `${currentUserId ?? ""}/${chat.id}/${message.id}`;
  const localUsers = commenters(messages, message.id);
  const [loaded, setLoaded] = useState<{ key: string; users: Commenter[] } | null>(null);
  const cached = summaries.get(key);
  const users = localUsers.length ? localUsers : loaded?.key === key ? loaded.users : cached?.users ?? [];
  useEffect(() => {
    const local = messages.filter((item) => item.threadRootMessageId === message.id && !item.deletedAt);
    if (local.length >= count) {
      summaries.set(key, { count, users: commenters(local, message.id) });
      return;
    }
    if (!accessToken || summaries.get(key)?.count === count) return;
    let cancelled = false;
    void getMessages(accessToken, chat.id, undefined, 100, message.id).then((replies) => {
      const users = commenters(replies, message.id);
      summaries.set(key, { count, users });
      if (summaries.size > 256) summaries.delete(summaries.keys().next().value!);
      if (!cancelled) setLoaded({ key, users });
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [accessToken, chat.id, count, key, message.id, messages]);
  return <button type="button" className="thread-open-button" aria-label={strings.comments.count(count)} onClick={onOpen}>
    <MessageCircle size={16} aria-hidden="true" />
    <span className="thread-summary-count">{count}</span>
    <span className="thread-summary-avatars" aria-hidden="true">
      {users.slice(0, 2).map((user) => <RealAvatar key={user.id} accessToken={accessToken} className="avatar thread-summary-avatar"
        file={chat.members.find((member) => member.id === user.id)?.profilePhoto} label={user.name} />)}
      {users.length > 2 && <span className="thread-summary-overflow">+</span>}
    </span>
    <span className="thread-summary-action">{strings.contextMenu.comment}</span>
    <ChevronRight size={16} aria-hidden="true" />
  </button>;
}
