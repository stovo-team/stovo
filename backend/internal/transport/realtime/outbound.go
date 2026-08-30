package realtime

// EmitToUser is the narrow outbound boundary used by transport serialization
// helpers. The caller decides how a user-scoped Socket.IO room is reached.
type EmitToUser func(userID, event string, payload any) error

// EmitToUsers delivers the same established event payload to each user. Socket
// delivery has historically been best-effort, so individual emit errors are
// deliberately ignored here as they were at the former app call sites.
func EmitToUsers(emit EmitToUser, userIDs []string, event string, payload any) {
	for _, userID := range userIDs {
		_ = emit(userID, event, payload)
	}
}

// MessageReadPayload preserves the message:read Socket.IO payload contract.
func MessageReadPayload(chatID, messageID, userID string) map[string]any {
	return map[string]any{"messageId": messageID, "chatId": chatID, "userId": userID}
}

// MessageDeletedPayload preserves the message:deleted Socket.IO payload contract.
func MessageDeletedPayload(chatID, messageID string) map[string]any {
	return map[string]any{"messageId": messageID, "chatId": chatID}
}

// MessageUnpinnedPayload preserves the message:unpinned Socket.IO payload contract.
func MessageUnpinnedPayload(chatID, messageID string) map[string]any {
	return map[string]any{"chatId": chatID, "messageId": messageID}
}

// TypingPayload preserves the typing:update Socket.IO payload contract.
func TypingPayload(chatID, userID, displayName string, isTyping bool) map[string]any {
	return map[string]any{
		"chatId": chatID, "userId": userID, "displayName": displayName, "isTyping": isTyping,
	}
}

// MessageDeliveredPayload preserves the message:delivered Socket.IO payload contract.
func MessageDeliveredPayload(chatID, messageID string, userIDs []string) map[string]any {
	return map[string]any{"messageId": messageID, "chatId": chatID, "userIds": userIDs}
}
