import { callHistoryLabel } from "../../../callHistory";
import type { Chat, Message } from "../../../api/chats";
import type { FamilyFile } from "../../../api/files";
import { isMediaAttachment } from "../../../components/MessageMediaAlbum";

export const MESSAGE_REACTION_CHOICES = ["👍", "❤️", "😂", "😮", "🙏"];

/** Extra reactions shown after expanding the context-menu reaction grid (scrollable). */
export const MESSAGE_REACTION_EXTENDED = [
  "😀",
  "😍",
  "🥰",
  "😎",
  "😢",
  "👏",
  "🔥",
  "🎉",
  "✨",
  "💯",
  "✅",
  "❗",
  "😊",
  "😁",
  "🤣",
  "😅",
  "😆",
  "😉",
  "😘",
  "😜",
  "🤗",
  "🤔",
  "😐",
  "😴",
  "😭",
  "😤",
  "😡",
  "🤯",
  "🤮",
  "🤢",
  "🥺",
  "😱",
  "🤤",
  "🥳",
  "🫡",
  "🤝",
  "💪",
  "👀",
  "🙈",
  "🙉",
  "🙊",
  "💀",
  "💩",
  "👻",
  "👽",
  "🤖",
  "😺",
  "👎",
  "👊",
  "✌️",
  "🤞",
  "🤙",
  "👋",
  "🙌",
  "🫶",
  "💔",
  "💕",
  "💖",
  "💙",
  "💚",
  "💛",
  "🧡",
  "💜",
  "🖤",
  "🤍",
  "⭐",
  "🌟",
  "⚡",
  "💥",
  "💫",
  "☀️",
  "🌙",
  "🌈",
  "☁️",
  "❄️",
  "🍀",
  "🌸",
  "🍕",
  "🍔",
  "🍟",
  "🍩",
  "☕",
  "🍺",
  "🍷",
  "🎂",
  "🎁",
  "🎈",
  "🏆",
  "⚽",
  "🏀",
  "🎯",
  "🎮",
  "🎵",
  "📸",
  "📷",
  "🎬",
  "📱",
  "💻",
  "🏠",
  "✈️",
  "🚗",
  "🚀",
  "⏰",
  "💡",
  "📌",
  "📎",
  "💬",
  "💭",
  "📢",
  "🔔",
  "🔒",
  "🔑",
  "❤️‍🔥",
  "🫠",
  "🤷",
  "🤦",
  "🙅",
  "🙆",
  "🙋"
];

export const COMPOSER_EMOJIS = [
  "😀",
  "😂",
  "😍",
  "🥰",
  "😊",
  "😎",
  "😢",
  "😮",
  "👍",
  "👎",
  "👏",
  "🙏",
  "❤️",
  "🔥",
  "🎉",
  "✨",
  "💬",
  "📷",
  "🍕",
  "☕",
  "🏠",
  "🌟",
  "✅",
  "❗"
];

export function emojiSizeClass(content: string | null | undefined): string {
  if (!content) return "";
  const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  const segments = [...segmenter.segment(content.trim())];
  if (!segments.every((s) => /^\p{Emoji}/u.test(s.segment) || /^\s+$/.test(s.segment))) {
    return "";
  }
  const emojiCount = segments.filter((s) => /^\p{Emoji}/u.test(s.segment)).length;
  if (emojiCount === 0) return "";
  if (emojiCount === 1) return "emoji-only-xl";
  if (emojiCount === 2) return "emoji-only-lg";
  if (emojiCount === 3) return "emoji-only-md";
  return "";
}

export function messagePreviewText(message: Message) {
  if (message.type === "call" && message.call) {
    return callHistoryLabel(message.call);
  }
  if (message.content?.trim()) {
    return message.content.trim();
  }
  if (message.attachments.length > 1) {
    return `${message.attachments.length} attachments`;
  }
  if (message.attachments.length === 1) {
    const file = message.attachments[0];
    if (file.mimeType.startsWith("image/")) {
      return "Photo";
    }
    if (file.mimeType.startsWith("video/")) {
      return "Video";
    }
    return "File";
  }
  if (message.type === "image") {
    return "Photo";
  }
  if (message.type === "video") {
    return "Video";
  }
  if (message.type === "file") {
    return "File";
  }
  return "Message";
}

export function formatDateSeparator(value: string | null | undefined) {
  if (!value) {
    return "Today";
  }
  const date = new Date(value);
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === now.toDateString()) {
    return "Today";
  }
  if (date.toDateString() === yesterday.toDateString()) {
    return "Yesterday";
  }
  return date.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

export function messageDeliveryLabel(message: Message, mine: boolean) {
  if (message.deliveryState === "failed") {
    return "Failed";
  }
  if (message.deliveryState === "scheduled") {
    if (message.scheduledFor) {
      const scheduledDate = new Date(message.scheduledFor);
      if (!Number.isNaN(scheduledDate.getTime())) {
        const isToday = new Date().toDateString() === scheduledDate.toDateString();
        const timeStr = scheduledDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        return isToday
          ? `Scheduled for ${timeStr}`
          : `Scheduled for ${scheduledDate.toLocaleDateString([], { month: "short", day: "numeric" })}, ${timeStr}`;
      }
    }
    return "Scheduled";
  }
  return new Date(message.createdAt).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });
}

export function messageReceiptState(
  message: Pick<Message, "statuses" | "deliveryState">,
  mine: boolean
): "sent" | "delivered" | "read" | null {
  if (!mine || message.deliveryState === "failed" || message.deliveryState === "sending" || message.deliveryState === "scheduled") {
    return null;
  }
  if (message.statuses.some((status) => status.status === "read")) {
    return "read";
  }
  if (message.statuses.some((status) => status.status === "delivered")) {
    return "delivered";
  }
  return "sent";
}

export function messageOriginChatId(
  chats: Array<Pick<Chat, "id" | "type" | "members">>,
  forwardedChatId: string | null | undefined,
  replySenderId: string | null | undefined
): string | null {
  if (forwardedChatId) {
    return chats.find((chat) => chat.id === forwardedChatId)?.id ?? null;
  }
  if (!replySenderId) {
    return null;
  }
  return (
    chats.find(
      (chat) => chat.type === "direct" && chat.members.some((member) => member.id === replySenderId)
    )?.id ?? null
  );
}

export function isGroupedMessage(
  message: Message,
  previous: Message | undefined,
  currentUserId: string | undefined
) {
  if (!previous) {
    return false;
  }
  const mine = message.senderId === currentUserId;
  const previousMine = previous.senderId === currentUserId;
  if (mine !== previousMine || message.senderId !== previous.senderId) {
    return false;
  }
  const elapsed =
    new Date(message.createdAt).getTime() - new Date(previous.createdAt).getTime();
  return elapsed <= 5 * 60 * 1000;
}

export function extractMessageLinks(content: string | null): string[] {
  if (!content) {
    return [];
  }
  const matches = content.match(/https?:\/\/[^\s<>"'`\]]+/gi) ?? [];
  return Array.from(new Set(matches.map((url) => url.replace(/[.,!?;:]+$/, ""))));
}

export function messageActionSummary(message: Message) {
  if (message.content?.trim()) {
    return message.content.trim();
  }
  if (message.attachments.length === 1) {
    return message.attachments[0].originalName;
  }
  if (message.attachments.length > 1) {
    return `${message.attachments.length} attachments`;
  }
  return "Message";
}

export function firstImageAttachment(message: Message): FamilyFile | null {
  return message.attachments.find((file) => file.mimeType.startsWith("image/")) ?? null;
}

export function isImageAttachment(file: FamilyFile) {
  return file.mimeType.startsWith("image/");
}

export function messageHasOnlyMediaAttachments(message: Message) {
  return (
    message.attachments.length > 0 &&
    message.attachments.every((file) => isMediaAttachment(file))
  );
}

export function isMultiMemberChat(type: Chat["type"]) {
  return type === "family" || type === "group" || type === "channel";
}

export function shouldShowMessageSender(chatType: Chat["type"], mine: boolean) {
  return !mine && isMultiMemberChat(chatType);
}

export const MESSAGE_LIST_NEAR_BOTTOM_PX = 120;

export function messageListDistanceFromBottom(
  scrollHeight: number,
  scrollTop: number,
  clientHeight: number
) {
  return scrollHeight - scrollTop - clientHeight;
}

export function isMessageListNearBottom(
  scrollHeight: number,
  scrollTop: number,
  clientHeight: number,
  thresholdPx = MESSAGE_LIST_NEAR_BOTTOM_PX
) {
  return messageListDistanceFromBottom(scrollHeight, scrollTop, clientHeight) <= thresholdPx;
}

export function countMessagesAfterAnchor(
  messages: Array<{ id: string }>,
  anchorMessageId: string | null
) {
  if (!anchorMessageId) {
    return 0;
  }
  const anchorIndex = messages.findIndex((message) => message.id === anchorMessageId);
  if (anchorIndex < 0) {
    return 0;
  }
  return messages.length - anchorIndex - 1;
}
