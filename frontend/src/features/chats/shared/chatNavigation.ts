/** A cached chat ID may survive while another app page is visible. */
export function navigateToSelectedChat(chatId: string, cachedChatId: string | undefined, pathname: string, navigate: () => void) {
  const onChatRoute = /^(?:\/s\/[^/]+)?\/app\/chats\/[^/]+\/?$/.test(pathname);
  if (chatId !== cachedChatId || !onChatRoute) navigate();
}

/** Browser widths above 768px show the chat list beside the conversation, so an empty pane should reopen the last chat. */
export function canAutoOpenLastChat(viewportWidth: number, isNativePlatform: boolean) {
  return !isNativePlatform && viewportWidth > 768;
}
