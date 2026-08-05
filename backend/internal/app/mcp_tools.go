package app

import (
	"context"
	"fmt"
	"net/url"
	"strings"
	"time"

	"family-messenger/backend/internal/repository"

	"github.com/mark3labs/mcp-go/mcp"
	mcpserver "github.com/mark3labs/mcp-go/server"
)

func (s *Server) registerMCPTools(mcpSrv *mcpserver.MCPServer) {
	mcpSrv.AddTool(mcp.NewTool("list_chats",
		mcp.WithDescription("List chats this Stovo connector is allowed to access. Does not return chats outside the connector policy."),
	), s.mcpListChats)

	mcpSrv.AddTool(mcp.NewTool("get_chat_history",
		mcp.WithDescription("Read recent messages from an allowed chat. History is capped by the connector's configured maximum history window."),
		mcp.WithString("chat_id", mcp.Required(), mcp.Description("Allowed chat ID")),
		mcp.WithNumber("limit", mcp.Description("Max messages to return (capped by connector policy)")),
		mcp.WithString("before_message_id", mcp.Description("Optional cursor: return messages older than this message ID")),
	), s.mcpGetChatHistory)

	mcpSrv.AddTool(mcp.NewTool("search_messages",
		mcp.WithDescription("Search message text within allowed chats. Results are limited by connector history policy."),
		mcp.WithString("query", mcp.Required(), mcp.Description("Case-insensitive search text")),
		mcp.WithString("chat_id", mcp.Description("Optional allowed chat ID to restrict search")),
		mcp.WithNumber("limit", mcp.Description("Max matches to return")),
	), s.mcpSearchMessages)

	mcpSrv.AddTool(mcp.NewTool("send_message",
		mcp.WithDescription("Send a new text message to an allowed chat. Requires messages.send permission."),
		mcp.WithString("chat_id", mcp.Required(), mcp.Description("Allowed chat ID")),
		mcp.WithString("content", mcp.Required(), mcp.Description("Message text (max 4000 characters)")),
		mcp.WithString("reply_to_message_id", mcp.Description("Optional message ID to reply to")),
	), s.mcpSendMessage)

	mcpSrv.AddTool(mcp.NewTool("edit_message",
		mcp.WithDescription("Edit a message previously sent by this connector. Requires messages.edit permission. Destructive relative to chat history."),
		mcp.WithString("message_id", mcp.Required(), mcp.Description("Message ID sent by this connector")),
		mcp.WithString("content", mcp.Required(), mcp.Description("Updated message text")),
	), s.mcpEditMessage)

	mcpSrv.AddTool(mcp.NewTool("delete_message",
		mcp.WithDescription("Permanently soft-delete a message previously sent by this connector for everyone. Requires messages.delete permission. This is a destructive action."),
		mcp.WithString("message_id", mcp.Required(), mcp.Description("Message ID sent by this connector")),
	), s.mcpDeleteMessage)

	mcpSrv.AddTool(mcp.NewTool("add_reaction",
		mcp.WithDescription("Add an emoji reaction to a message in an allowed chat. Requires messages.react permission."),
		mcp.WithString("message_id", mcp.Required(), mcp.Description("Message ID")),
		mcp.WithString("emoji", mcp.Required(), mcp.Description("Emoji reaction")),
	), s.mcpAddReaction)

	mcpSrv.AddTool(mcp.NewTool("remove_reaction",
		mcp.WithDescription("Remove this connector's emoji reaction from a message. Requires messages.react permission."),
		mcp.WithString("message_id", mcp.Required(), mcp.Description("Message ID")),
		mcp.WithString("emoji", mcp.Required(), mcp.Description("Emoji reaction to remove")),
	), s.mcpRemoveReaction)

	mcpSrv.AddTool(mcp.NewTool("forward_message",
		mcp.WithDescription("Forward a message into another allowed chat. Requires messages.forward permission. Both source and target chats must be allowed."),
		mcp.WithString("message_id", mcp.Required(), mcp.Description("Source message ID")),
		mcp.WithString("target_chat_id", mcp.Required(), mcp.Description("Allowed destination chat ID")),
	), s.mcpForwardMessage)

	mcpSrv.AddTool(mcp.NewTool("pin_message",
		mcp.WithDescription("Pin a message in an allowed chat. Requires messages.pin permission."),
		mcp.WithString("chat_id", mcp.Required(), mcp.Description("Allowed chat ID")),
		mcp.WithString("message_id", mcp.Required(), mcp.Description("Message ID in that chat")),
	), s.mcpPinMessage)

	mcpSrv.AddTool(mcp.NewTool("unpin_message",
		mcp.WithDescription("Unpin a message in an allowed chat. Requires messages.unpin permission."),
		mcp.WithString("chat_id", mcp.Required(), mcp.Description("Allowed chat ID")),
		mcp.WithString("message_id", mcp.Required(), mcp.Description("Pinned message ID")),
	), s.mcpUnpinMessage)

	mcpSrv.AddTool(mcp.NewTool("list_chat_files",
		mcp.WithDescription("List file metadata attached to an allowed chat. Requires files.list permission."),
		mcp.WithString("chat_id", mcp.Required(), mcp.Description("Allowed chat ID")),
		mcp.WithNumber("limit", mcp.Description("Max files to return")),
	), s.mcpListChatFiles)

	mcpSrv.AddTool(mcp.NewTool("get_file_download_link",
		mcp.WithDescription("Create a time-limited authorized download URL for a file visible in an allowed chat. Requires files.download permission. Treat as sensitive."),
		mcp.WithString("file_id", mcp.Required(), mcp.Description("File ID")),
	), s.mcpGetFileDownloadLink)
}

func (s *Server) mcpRequire(ctx context.Context, permission string, chatID *string) (mcpConnectorRecord, userPublic, *mcp.CallToolResult) {
	connector, ok := mcpConnectorFromContext(ctx)
	if !ok {
		result, _ := s.mcpToolError("connector authentication required")
		return mcpConnectorRecord{}, userPublic{}, result
	}
	if permission != "" {
		if err := s.requireMCPPermission(connector, permission); err != nil {
			msg := fmt.Sprintf("permission denied: %s", permission)
			s.recordMCPAudit(ctx, connector, permission, chatID, nil, false, &msg, nil)
			result, _ := s.mcpToolError(msg)
			return mcpConnectorRecord{}, userPublic{}, result
		}
	}
	if chatID != nil {
		if err := s.requireMCPChatAllowed(connector, *chatID); err != nil {
			msg := "chat is not allowed for this connector"
			s.recordMCPAudit(ctx, connector, permission, chatID, nil, false, &msg, nil)
			result, _ := s.mcpToolError(msg)
			return mcpConnectorRecord{}, userPublic{}, result
		}
	}
	actor, err := s.mcpActor(connector)
	if err != nil {
		result, _ := s.mcpToolError("connector actor unavailable")
		return mcpConnectorRecord{}, userPublic{}, result
	}
	return connector, actor, nil
}

func (s *Server) mcpListChats(ctx context.Context, _ mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	connector, actor, deny := s.mcpRequire(ctx, mcpPermChatsList, nil)
	if deny != nil {
		return deny, nil
	}
	chats := make([]map[string]any, 0, len(connector.AllowedChatIDs))
	for _, chatID := range connector.AllowedChatIDs {
		chat, err := s.buildChatPublic(chatID, actor)
		if err != nil {
			continue
		}
		chats = append(chats, map[string]any{
			"id":    chat.ID,
			"type":  chat.Type,
			"title": chat.Title,
		})
	}
	s.recordMCPAudit(ctx, connector, mcpPermChatsList, nil, nil, true, nil, map[string]any{"count": len(chats)})
	return s.mcpToolJSON(map[string]any{"chats": chats})
}

func (s *Server) mcpGetChatHistory(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	chatID, err := request.RequireString("chat_id")
	if err != nil {
		return s.mcpToolError("chat_id is required")
	}
	connector, actor, deny := s.mcpRequire(ctx, mcpPermMessagesRead, &chatID)
	if deny != nil {
		return deny, nil
	}
	limit := request.GetInt("limit", connector.MaxHistoryMessages)
	if limit < 1 {
		limit = connector.MaxHistoryMessages
	}
	if limit > connector.MaxHistoryMessages {
		limit = connector.MaxHistoryMessages
	}
	before := strings.TrimSpace(request.GetString("before_message_id", ""))
	messages, hasMore, err := s.listMessagesPage(chatID, actor, before, limit, "")
	if err != nil {
		msg := err.Error()
		s.recordMCPAudit(ctx, connector, mcpPermMessagesRead, &chatID, nil, false, &msg, nil)
		return s.mcpToolError("could not load messages")
	}
	s.recordMCPAudit(ctx, connector, mcpPermMessagesRead, &chatID, nil, true, nil, map[string]any{"count": len(messages)})
	return s.mcpToolJSON(map[string]any{
		"chatId":   chatID,
		"messages": messages,
		"hasMore":  hasMore,
	})
}

func (s *Server) mcpSearchMessages(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	query, err := request.RequireString("query")
	if err != nil || strings.TrimSpace(query) == "" {
		return s.mcpToolError("query is required")
	}
	query = strings.TrimSpace(query)
	if len(query) > 200 {
		return s.mcpToolError("query is too long")
	}
	var chatFilter *string
	chatID := strings.TrimSpace(request.GetString("chat_id", ""))
	if chatID != "" {
		chatFilter = &chatID
	}
	connector, actor, deny := s.mcpRequire(ctx, mcpPermMessagesSearch, chatFilter)
	if deny != nil {
		return deny, nil
	}
	limit := request.GetInt("limit", connector.MaxHistoryMessages)
	if limit < 1 || limit > connector.MaxHistoryMessages {
		limit = connector.MaxHistoryMessages
	}

	allowed := connector.AllowedChatIDs
	if chatFilter != nil {
		allowed = []string{*chatFilter}
	}
	if len(allowed) == 0 {
		return s.mcpToolJSON(map[string]any{"matches": []any{}})
	}

	hits, err := s.store.SearchPlaintextMessages(ctx, allowed, query, limit)
	if err != nil {
		return s.mcpToolError("search failed")
	}
	matches := make([]messagePublic, 0, len(hits))
	for _, hit := range hits {
		message, buildErr := s.buildMessage(hit.ID, actor.ID)
		if buildErr == nil {
			matches = append(matches, message)
		}
	}
	if len(matches) < limit {
		candidates, encErr := s.store.ListEncryptedMessageCandidates(ctx, allowed, encryptionProtocolServerAtRest, connector.MaxHistoryMessages*3)
		if encErr == nil {
			seen := map[string]struct{}{}
			for _, existing := range matches {
				seen[existing.ID] = struct{}{}
			}
			needle := strings.ToLower(query)
			for _, cand := range candidates {
				if len(matches) >= limit {
					break
				}
				if _, ok := seen[cand.ID]; ok {
					continue
				}
				plain, decErr := s.decryptServerAtRest(cand.FamilyID, cand.Ciphertext, cand.Nonce)
				if decErr != nil || plain == nil {
					continue
				}
				if !strings.Contains(strings.ToLower(*plain), needle) {
					continue
				}
				message, buildErr := s.buildMessage(cand.ID, actor.ID)
				if buildErr == nil {
					matches = append(matches, message)
					seen[cand.ID] = struct{}{}
				}
			}
		}
	}

	s.recordMCPAudit(ctx, connector, mcpPermMessagesSearch, chatFilter, nil, true, nil, map[string]any{"count": len(matches)})
	return s.mcpToolJSON(map[string]any{"matches": matches})
}

func (s *Server) mcpSendMessage(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	chatID, err := request.RequireString("chat_id")
	if err != nil {
		return s.mcpToolError("chat_id is required")
	}
	content, err := request.RequireString("content")
	if err != nil {
		return s.mcpToolError("content is required")
	}
	content = strings.TrimSpace(content)
	if content == "" {
		return s.mcpToolError("content is required")
	}
	if len(content) > 4000 {
		return s.mcpToolError("content exceeds maximum length of 4000 characters")
	}
	connector, actor, deny := s.mcpRequire(ctx, mcpPermMessagesSend, &chatID)
	if deny != nil {
		return deny, nil
	}
	payload := sendMessageRequest{
		Type:    "text",
		Content: &content,
	}
	if replyTo := strings.TrimSpace(request.GetString("reply_to_message_id", "")); replyTo != "" {
		payload.ReplyToMessageID = &replyTo
	}
	message, sendErr := s.createMessageWithPayloadContext(ctx, actor, chatID, payload, nil, nil)
	if sendErr != nil {
		msg := sendErr.Error()
		s.recordMCPAudit(ctx, connector, mcpPermMessagesSend, &chatID, nil, false, &msg, nil)
		return s.mcpToolError(msg)
	}
	s.recordMCPAudit(ctx, connector, mcpPermMessagesSend, &chatID, &message.ID, true, nil, nil)
	return s.mcpToolJSON(message)
}

func (s *Server) mcpEditMessage(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	messageID, err := request.RequireString("message_id")
	if err != nil {
		return s.mcpToolError("message_id is required")
	}
	content, err := request.RequireString("content")
	if err != nil {
		return s.mcpToolError("content is required")
	}
	content = strings.TrimSpace(content)
	if content == "" {
		return s.mcpToolError("content is required")
	}
	if len(content) > 4000 {
		return s.mcpToolError("content exceeds maximum length of 4000 characters")
	}
	connector, actor, deny := s.mcpRequire(ctx, mcpPermMessagesEdit, nil)
	if deny != nil {
		return deny, nil
	}

	meta, err := s.store.GetActiveMessageMeta(ctx, messageID)
	if err != nil {
		return s.mcpToolError("message not found")
	}
	chatID := meta.ChatID
	if err := s.requireMCPChatAllowed(connector, chatID); err != nil {
		msg := "chat is not allowed for this connector"
		s.recordMCPAudit(ctx, connector, mcpPermMessagesEdit, &chatID, &messageID, false, &msg, nil)
		return s.mcpToolError(msg)
	}
	if meta.SenderID != actor.ID {
		msg := "you can only edit messages sent by this connector"
		s.recordMCPAudit(ctx, connector, mcpPermMessagesEdit, &chatID, &messageID, false, &msg, nil)
		return s.mcpToolError(msg)
	}
	chat, err := s.buildChatPublic(chatID, actor)
	if err != nil {
		return s.mcpToolError("chat not found")
	}
	now := nowString()
	if chat.EncryptionProtocol == encryptionProtocolServerAtRest {
		ciphertext, nonce, encErr := s.encryptServerAtRest(chat.FamilyID, content)
		if encErr != nil {
			return s.mcpToolError("encryption failed")
		}
		if err := s.store.UpdateMessageEncryptedContent(ctx, repository.UpdateMessageEncryptedContentParams{
			MessageID:          messageID,
			Ciphertext:         ciphertext,
			Nonce:              nonce,
			KeyVersion:         1,
			EncryptionMetadata: messageEncryptionMetadataServer,
			UpdatedAt:          now,
		}); err != nil {
			return s.mcpToolError("failed to update message")
		}
	} else if err := s.store.UpdateMessagePlainContent(ctx, messageID, content, now); err != nil {
		return s.mcpToolError("failed to update message")
	}
	message, err := s.buildMessage(messageID, actor.ID)
	if err != nil {
		return s.mcpToolError("failed to load updated message")
	}
	s.emitMessageUpdated(chatID, message)
	s.bumpChatHistoryRevision(ctx, chatID)
	s.recordMCPAudit(ctx, connector, mcpPermMessagesEdit, &chatID, &messageID, true, nil, nil)
	return s.mcpToolJSON(message)
}

func (s *Server) mcpDeleteMessage(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	messageID, err := request.RequireString("message_id")
	if err != nil {
		return s.mcpToolError("message_id is required")
	}
	connector, actor, deny := s.mcpRequire(ctx, mcpPermMessagesDelete, nil)
	if deny != nil {
		return deny, nil
	}
	meta, err := s.store.GetActiveMessageMeta(ctx, messageID)
	if err != nil {
		return s.mcpToolError("message not found")
	}
	chatID := meta.ChatID
	if err := s.requireMCPChatAllowed(connector, chatID); err != nil {
		msg := "chat is not allowed for this connector"
		s.recordMCPAudit(ctx, connector, mcpPermMessagesDelete, &chatID, &messageID, false, &msg, nil)
		return s.mcpToolError(msg)
	}
	if meta.SenderID != actor.ID {
		msg := "you can only delete messages sent by this connector"
		s.recordMCPAudit(ctx, connector, mcpPermMessagesDelete, &chatID, &messageID, false, &msg, nil)
		return s.mcpToolError(msg)
	}
	if err := s.store.SoftDeleteMessage(ctx, messageID, nowString()); err != nil {
		return s.mcpToolError("failed to delete message")
	}
	s.emitMessageDeleted(chatID, messageID)
	s.bumpChatHistoryRevision(ctx, chatID)
	s.recordMCPAudit(ctx, connector, mcpPermMessagesDelete, &chatID, &messageID, true, nil, nil)
	return s.mcpToolJSON(map[string]string{"messageId": messageID, "chatId": chatID})
}

func (s *Server) mcpAddReaction(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	return s.mcpToggleReaction(ctx, request, true)
}

func (s *Server) mcpRemoveReaction(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	return s.mcpToggleReaction(ctx, request, false)
}

func (s *Server) mcpToggleReaction(ctx context.Context, request mcp.CallToolRequest, add bool) (*mcp.CallToolResult, error) {
	messageID, err := request.RequireString("message_id")
	if err != nil {
		return s.mcpToolError("message_id is required")
	}
	emoji, err := request.RequireString("emoji")
	if err != nil || strings.TrimSpace(emoji) == "" {
		return s.mcpToolError("emoji is required")
	}
	connector, actor, deny := s.mcpRequire(ctx, mcpPermMessagesReact, nil)
	if deny != nil {
		return deny, nil
	}
	chatID, err := s.store.MessageChatIDIfActive(ctx, messageID)
	if err != nil {
		return s.mcpToolError("message not found")
	}
	if err := s.requireMCPChatAllowed(connector, chatID); err != nil {
		msg := "chat is not allowed for this connector"
		s.recordMCPAudit(ctx, connector, mcpPermMessagesReact, &chatID, &messageID, false, &msg, nil)
		return s.mcpToolError(msg)
	}
	message, reactErr := s.setMessageReaction(ctx, actor, messageID, strings.TrimSpace(emoji), add)
	if reactErr != nil {
		msg := reactErr.Error()
		s.recordMCPAudit(ctx, connector, mcpPermMessagesReact, &chatID, &messageID, false, &msg, nil)
		return s.mcpToolError(msg)
	}
	s.recordMCPAudit(ctx, connector, mcpPermMessagesReact, &chatID, &messageID, true, nil, map[string]any{"add": add})
	return s.mcpToolJSON(message)
}

func (s *Server) mcpForwardMessage(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	messageID, err := request.RequireString("message_id")
	if err != nil {
		return s.mcpToolError("message_id is required")
	}
	targetChatID, err := request.RequireString("target_chat_id")
	if err != nil {
		return s.mcpToolError("target_chat_id is required")
	}
	connector, actor, deny := s.mcpRequire(ctx, mcpPermMessagesForward, nil)
	if deny != nil {
		return deny, nil
	}
	sourceChatID, err := s.store.MessageChatIDIfActive(ctx, messageID)
	if err != nil {
		return s.mcpToolError("message not found")
	}
	if err := s.requireMCPChatAllowed(connector, sourceChatID); err != nil {
		msg := "chat is not allowed for this connector"
		s.recordMCPAudit(ctx, connector, mcpPermMessagesForward, &sourceChatID, &messageID, false, &msg, nil)
		return s.mcpToolError(msg)
	}
	if err := s.requireMCPChatAllowed(connector, targetChatID); err != nil {
		msg := "target chat is not allowed for this connector"
		s.recordMCPAudit(ctx, connector, mcpPermMessagesForward, &targetChatID, &messageID, false, &msg, nil)
		return s.mcpToolError(msg)
	}
	message, forwardErr := s.forwardMessage(ctx, actor, messageID, targetChatID)
	if forwardErr != nil {
		msg := forwardErr.Error()
		s.recordMCPAudit(ctx, connector, mcpPermMessagesForward, &targetChatID, &messageID, false, &msg, nil)
		return s.mcpToolError(msg)
	}
	s.recordMCPAudit(ctx, connector, mcpPermMessagesForward, &targetChatID, &message.ID, true, nil, map[string]any{"sourceMessageId": messageID})
	return s.mcpToolJSON(message)
}

func (s *Server) mcpPinMessage(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	chatID, err := request.RequireString("chat_id")
	if err != nil {
		return s.mcpToolError("chat_id is required")
	}
	messageID, err := request.RequireString("message_id")
	if err != nil {
		return s.mcpToolError("message_id is required")
	}
	connector, actor, deny := s.mcpRequire(ctx, mcpPermMessagesPin, &chatID)
	if deny != nil {
		return deny, nil
	}
	fetchedChatID, err := s.store.MessageChatIDIfActive(ctx, messageID)
	if err != nil || fetchedChatID != chatID {
		return s.mcpToolError("message not found")
	}
	if _, err := s.buildChatPublic(chatID, actor); err != nil {
		return s.mcpToolError("chat not found")
	}
	now := time.Now().UTC()
	if _, err := s.store.TryPinMessage(ctx, chatID, messageID, actor.ID, now); err != nil {
		return s.mcpToolError("failed to pin message")
	}
	message, err := s.buildMessage(messageID, actor.ID)
	if err != nil {
		return s.mcpToolError("failed to load pinned message")
	}
	pinned := pinnedMessagePublic{
		ChatID:    chatID,
		MessageID: messageID,
		PinnedBy:  actor.ID,
		PinnedAt:  now,
		Message:   message,
	}
	s.emitMessagePinned(chatID, pinned)
	s.recordMCPAudit(ctx, connector, mcpPermMessagesPin, &chatID, &messageID, true, nil, nil)
	return s.mcpToolJSON(pinned)
}

func (s *Server) mcpUnpinMessage(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	chatID, err := request.RequireString("chat_id")
	if err != nil {
		return s.mcpToolError("chat_id is required")
	}
	messageID, err := request.RequireString("message_id")
	if err != nil {
		return s.mcpToolError("message_id is required")
	}
	connector, actor, deny := s.mcpRequire(ctx, mcpPermMessagesUnpin, &chatID)
	if deny != nil {
		return deny, nil
	}
	if _, err := s.buildChatPublic(chatID, actor); err != nil {
		return s.mcpToolError("chat not found")
	}
	if _, err := s.store.GetPin(ctx, chatID, messageID); err != nil {
		return s.mcpToolError("pin not found")
	}
	if err := s.store.DeletePin(ctx, chatID, messageID); err != nil {
		return s.mcpToolError("failed to unpin message")
	}
	s.emitMessageUnpinned(chatID, messageID)
	s.recordMCPAudit(ctx, connector, mcpPermMessagesUnpin, &chatID, &messageID, true, nil, nil)
	return s.mcpToolJSON(map[string]string{"chatId": chatID, "messageId": messageID})
}

func (s *Server) mcpListChatFiles(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	chatID, err := request.RequireString("chat_id")
	if err != nil {
		return s.mcpToolError("chat_id is required")
	}
	connector, actor, deny := s.mcpRequire(ctx, mcpPermFilesList, &chatID)
	if deny != nil {
		return deny, nil
	}
	limit := request.GetInt("limit", connector.MaxHistoryMessages)
	if limit < 1 || limit > connector.MaxHistoryMessages {
		limit = connector.MaxHistoryMessages
	}
	fileIDs, err := s.store.ListChatFileIDs(ctx, connector.FamilyID, chatID, limit)
	if err != nil {
		return s.mcpToolError("could not list files")
	}
	files := make([]filePublic, 0)
	for _, fileID := range fileIDs {
		file, buildErr := s.buildFilePublic(fileID, actor.ID)
		if buildErr == nil && file.DeletedAt == nil && s.fileVisibleToUser(ctx, file, actor) {
			files = append(files, file)
		}
	}
	s.recordMCPAudit(ctx, connector, mcpPermFilesList, &chatID, nil, true, nil, map[string]any{"count": len(files)})
	return s.mcpToolJSON(map[string]any{"files": files})
}

func (s *Server) mcpGetFileDownloadLink(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	fileID, err := request.RequireString("file_id")
	if err != nil {
		return s.mcpToolError("file_id is required")
	}
	connector, actor, deny := s.mcpRequire(ctx, mcpPermFilesDownload, nil)
	if deny != nil {
		return deny, nil
	}
	file, _, loadErr := s.loadFileRecord(ctx, fileID, actor.ID)
	if loadErr != nil || file.DeletedAt != nil || !s.fileVisibleToUser(ctx, file, actor) {
		return s.mcpToolError("file not found")
	}
	if file.ChatID == nil {
		msg := "file is not scoped to an allowed chat"
		s.recordMCPAudit(ctx, connector, mcpPermFilesDownload, nil, nil, false, &msg, map[string]any{"fileId": fileID})
		return s.mcpToolError(msg)
	}
	if err := s.requireMCPChatAllowed(connector, *file.ChatID); err != nil {
		msg := "file chat is not allowed for this connector"
		s.recordMCPAudit(ctx, connector, mcpPermFilesDownload, file.ChatID, nil, false, &msg, map[string]any{"fileId": fileID})
		return s.mcpToolError(msg)
	}

	family, err := s.getFamily(connector.FamilyID)
	base := strings.TrimRight(s.cfg.AppURL, "/")
	if err == nil {
		settings := publicAccessSettingsForFamily(family, s.cfg.AppURL, s.cfg.APIURL)
		if settings.AppURL != "" {
			base = settings.AppURL
		}
	}

	var downloadURL string
	var expiresAt time.Time
	token, exp, mintErr := s.mintMediaPlaybackToken(actor.ID, actor.FamilyID, file.ID)
	if mintErr != nil {
		return s.mcpToolError("could not mint download token")
	}
	expiresAt = exp
	downloadURL = fmt.Sprintf("%s/api/media/%s?token=%s", strings.TrimRight(base, "/"), url.PathEscape(file.ID), url.QueryEscape(token))

	s.recordMCPAudit(ctx, connector, mcpPermFilesDownload, file.ChatID, nil, true, nil, map[string]any{"fileId": fileID})
	return s.mcpToolJSON(map[string]any{
		"fileId":      file.ID,
		"fileName":    file.OriginalName,
		"mimeType":    file.MimeType,
		"downloadUrl": downloadURL,
		"expiresAt":   expiresAt.UTC().Format(time.RFC3339),
	})
}
