import type { Chat } from "../../../api/chats";
import { AvatarChoicePicker } from "../../../components/AvatarChoicePicker";

export function ChatAvatarChoiceSettings({
  chat,
  label,
  accessToken,
  onChange
}: {
  chat: Chat;
  label: string;
  accessToken: string | null;
  onChange?: (patch: Partial<Pick<Chat, "avatarMode" | "avatarSymbolId" | "avatarColorId">>) => void | Promise<void>;
}) {
  if (chat.type !== "family" && chat.type !== "group" && chat.type !== "channel" && chat.type !== "voice") return null;
  const entityKind = chat.type === "family" ? "family" : chat.type === "group" ? "group" : chat.type === "voice" ? "voice" : "channel";
  return (
    <div className="chat-info-section chat-info-section--avatar-choices">
      <div className="chat-info-island">
        <AvatarChoicePicker
          accessToken={accessToken}
          entityId={chat.id}
          entityKind={entityKind}
          label={label}
          file={chat.chatPhoto}
          allowPhoto={Boolean(chat.chatPhoto)}
          mode={chat.avatarMode ?? (chat.chatPhoto ? "photo" : "symbol")}
          symbolId={chat.avatarSymbolId}
          colorId={chat.avatarColorId}
          onModeChange={(avatarMode) => void onChange?.({ avatarMode })}
          onSymbolChange={(avatarSymbolId) => void onChange?.({ avatarMode: "symbol", avatarSymbolId })}
          onColorChange={(avatarColorId) => void onChange?.({ avatarColorId })}
        />
      </div>
    </div>
  );
}
