/** A cached chat ID may survive while another app page is visible. */
export function navigateToSelectedChat(chatId: string, cachedChatId: string | undefined, pathname: string, navigate: () => void) {
  const onChatRoute = /^(?:\/s\/[^/]+)?\/app\/chats\/[^/]+\/?$/.test(pathname);
  if (chatId !== cachedChatId || !onChatRoute) navigate();
}
