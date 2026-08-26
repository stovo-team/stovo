package app

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"path"
	"slices"
	"strconv"
	"strings"
	"time"

	"family-messenger/backend/ent"
	"family-messenger/backend/internal/cache"
	"family-messenger/backend/internal/repository"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

type messageForwardSource struct {
	MessageID string
	ChatID    string
}

func (s *Server) handleGetChats(w http.ResponseWriter, _ *http.Request, user userPublic) {
	chats, err := s.listChats(user)
	if err != nil {
		s.logger.Errorf("chats", "list chats failed user_id=%s error=%v", user.ID, err)
		s.detail(w, http.StatusInternalServerError, "Could not load chats")
		return
	}
	s.json(w, http.StatusOK, chats)
}

// handleAttachMessageFiles finishes an attachment upload after the message has
// already been accepted. This keeps message submission independent from slow
// media transfers.
func (s *Server) handleAttachMessageFiles(w http.ResponseWriter, r *http.Request, user userPublic) {
	var payload attachMessageFilesRequest
	if err := s.decodeJSON(r, &payload); err != nil || len(payload.FileIDs) == 0 {
		s.detail(w, http.StatusUnprocessableEntity, "fileIds are required")
		return
	}
	meta, err := s.store.GetActiveMessageMeta(r.Context(), messageIDFromURL(r))
	if err != nil {
		s.detail(w, http.StatusNotFound, "Message not found")
		return
	}
	if meta.SenderID != user.ID {
		s.detail(w, http.StatusForbidden, "Only the sender can attach files")
		return
	}
	if _, err := s.loadAttachmentsForMessage(payload.FileIDs, user, meta.ChatID); err != nil {
		s.detail(w, http.StatusUnprocessableEntity, err.Error())
		return
	}
	tx, err := s.db.BeginTx(r.Context(), nil)
	if err != nil {
		s.detail(w, http.StatusInternalServerError, "Could not attach files")
		return
	}
	defer tx.Rollback()
	for _, fileID := range uniqueAttachmentFileIDs(payload.FileIDs) {
		if _, err := tx.ExecContext(r.Context(), `
			INSERT INTO message_attachments (message_id, file_id) VALUES ($1, $2)
			ON CONFLICT (message_id, file_id) DO NOTHING`, meta.ID, fileID); err != nil {
			s.logger.Errorf("chats", "add message attachment failed message_id=%s error=%v", meta.ID, err)
			s.detail(w, http.StatusInternalServerError, "Could not attach files")
			return
		}
	}
	if err := writeMessageChangedSyncEventTx(r.Context(), tx, user.FamilyID, meta.ChatID, meta.ID); err != nil {
		s.logger.Errorf("chats", "write message sync event failed message_id=%s error=%v", meta.ID, err)
		s.detail(w, http.StatusInternalServerError, "Could not attach files")
		return
	}
	if err := tx.Commit(); err != nil {
		s.logger.Errorf("chats", "add message attachments failed message_id=%s error=%v", meta.ID, err)
		s.detail(w, http.StatusInternalServerError, "Could not attach files")
		return
	}
	message, err := s.buildMessage(meta.ID, user.ID)
	if err != nil {
		s.detail(w, http.StatusInternalServerError, "Could not load message")
		return
	}
	s.emitMessageUpdated(meta.ChatID, message)
	s.bumpChatHistoryRevision(r.Context(), meta.ChatID)
	s.json(w, http.StatusOK, message)
}

// handleGetMessage is deliberately narrow for cursor deltas such as a
// background attachment completion. The chat authorization check runs before
// the viewer-specific message representation is returned.
func (s *Server) handleGetMessage(w http.ResponseWriter, r *http.Request, user userPublic) {
	meta, err := s.store.GetActiveMessageMeta(r.Context(), messageIDFromURL(r))
	if err != nil {
		s.detail(w, http.StatusNotFound, "Message not found")
		return
	}
	if _, err := s.buildChatPublic(meta.ChatID, user); err != nil {
		s.detail(w, http.StatusNotFound, "Message not found")
		return
	}
	message, err := s.buildMessage(meta.ID, user.ID)
	if err != nil {
		s.detail(w, http.StatusNotFound, "Message not found")
		return
	}
	s.json(w, http.StatusOK, message)
}

func (s *Server) handleGetChat(w http.ResponseWriter, r *http.Request, user userPublic) {
	chat, err := s.buildChatPublic(chatIDFromURL(r), user)
	if err != nil {
		if isMissing(err) {
			s.detail(w, http.StatusNotFound, "Chat not found")
			return
		}
		s.detail(w, http.StatusInternalServerError, "Could not load chat")
		return
	}
	s.json(w, http.StatusOK, chat)
}

func (s *Server) handleCreateDirectChat(w http.ResponseWriter, r *http.Request, user userPublic) {
	var payload createDirectChatRequest
	if err := s.decodeJSON(r, &payload); err != nil {
		s.detail(w, http.StatusUnprocessableEntity, "Invalid request body")
		return
	}
	target, err := s.getUserByID(payload.UserID)
	if err != nil || target.FamilyID != user.FamilyID || !target.IsActive {
		s.detail(w, http.StatusBadRequest, "Invalid direct chat target")
		return
	}
	if target.ID == user.ID {
		s.detail(w, http.StatusBadRequest, "You cannot start a direct chat with yourself")
		return
	}
	if blocked, err := s.directContactBlocked(user.ID, target.ID); err != nil {
		s.detail(w, http.StatusInternalServerError, "Could not check privacy settings")
		return
	} else if blocked {
		s.detail(w, http.StatusForbidden, "Direct messages are unavailable for this member")
		return
	}
	if !contactPermissionAllows(target, user.ID, "direct") {
		s.detail(w, http.StatusForbidden, "Direct messages are restricted by this member")
		return
	}

	if existingID, err := s.findDirectChat(user.ID, target.ID); err == nil {
		chat, _ := s.buildChatPublic(existingID, user)
		s.json(w, http.StatusCreated, chat)
		return
	}

	encryptionProtocol := s.defaultMessageEncryptionProtocol(user.FamilyID)
	chatID := uuid.NewString()
	now := nowString()
	if err := s.store.CreateChatWithMembers(r.Context(), repository.CreateChatParams{
		ID:                 chatID,
		FamilyID:           user.FamilyID,
		Type:               "direct",
		CreatedBy:          user.ID,
		MediaVisibility:    "members",
		EncryptionProtocol: encryptionProtocol,
		CreatedAt:          now,
		MemberIDs:          []string{user.ID, target.ID},
		CreatePreferences:  true,
	}); err != nil {
		s.logger.Errorf("chats", "create direct chat failed user_id=%s target_id=%s error=%v", user.ID, payload.UserID, err)
		s.detail(w, http.StatusInternalServerError, "Could not create direct chat")
		return
	}

	chat, err := s.buildChatPublic(chatID, user)
	if err != nil {
		s.logger.Errorf("chats", "create direct chat build failed chat_id=%s user_id=%s error=%v", chatID, user.ID, err)
		s.detail(w, http.StatusInternalServerError, "Could not load created chat")
		return
	}
	s.json(w, http.StatusCreated, chat)
}

func (s *Server) handleCreateGroupChat(w http.ResponseWriter, r *http.Request, user userPublic) {
	var payload createGroupChatRequest
	if err := s.decodeJSON(r, &payload); err != nil {
		s.detail(w, http.StatusUnprocessableEntity, "Invalid request body")
		return
	}
	payload.Title = strings.TrimSpace(payload.Title)
	if payload.Title == "" {
		s.detail(w, http.StatusUnprocessableEntity, "Invalid group chat payload")
		return
	}
	memberIDs, err := s.resolveChatMembers(user, payload.MemberIDs)
	if err != nil {
		s.detail(w, domainErrorStatus(err), "Invalid group chat members")
		return
	}
	if err := s.validateInvitePermissions(user, memberIDs, "group"); err != nil {
		s.detail(w, http.StatusForbidden, err.Error())
		return
	}

	chatID := uuid.NewString()
	encryptionProtocol := s.defaultMessageEncryptionProtocol(user.FamilyID)
	now := nowString()
	title := payload.Title
	if err := s.store.CreateChatWithMembers(r.Context(), repository.CreateChatParams{
		ID:                 chatID,
		FamilyID:           user.FamilyID,
		Type:               "group",
		Title:              &title,
		CreatedBy:          user.ID,
		MediaVisibility:    "family",
		EncryptionProtocol: encryptionProtocol,
		CreatedAt:          now,
		MemberIDs:          memberIDs,
		CreatePreferences:  true,
	}); err != nil {
		s.logger.Errorf("chats", "create group chat failed user_id=%s error=%v", user.ID, err)
		s.detail(w, http.StatusInternalServerError, "Could not create group chat")
		return
	}

	chat, err := s.buildChatPublic(chatID, user)
	if err != nil {
		s.logger.Errorf("chats", "create group chat build failed chat_id=%s user_id=%s error=%v", chatID, user.ID, err)
		s.detail(w, http.StatusInternalServerError, "Could not load created chat")
		return
	}
	s.json(w, http.StatusCreated, chat)
}

func (s *Server) handleCreateChannelChat(w http.ResponseWriter, r *http.Request, user userPublic) {
	if !hasPermission(user, permissionManageChannels) {
		s.detail(w, http.StatusForbidden, "Permission denied")
		return
	}

	var payload createChannelChatRequest
	if err := s.decodeJSON(r, &payload); err != nil {
		s.detail(w, http.StatusUnprocessableEntity, "Invalid request body")
		return
	}
	payload.Title = strings.TrimSpace(payload.Title)
	if payload.Title == "" {
		s.detail(w, http.StatusUnprocessableEntity, "Invalid channel chat payload")
		return
	}

	memberIDs, err := s.resolveChatMembers(user, payload.MemberIDs)
	if err != nil {
		s.detail(w, domainErrorStatus(err), "Invalid channel chat members")
		return
	}
	if err := s.validateInvitePermissions(user, memberIDs, "channel"); err != nil {
		s.detail(w, http.StatusForbidden, err.Error())
		return
	}

	chatID := uuid.NewString()
	encryptionProtocol := s.defaultMessageEncryptionProtocol(user.FamilyID)
	now := nowString()
	title := payload.Title
	commentsEnabled := true
	if err := s.store.CreateChatWithMembers(r.Context(), repository.CreateChatParams{
		ID:                 chatID,
		FamilyID:           user.FamilyID,
		Type:               "channel",
		Title:              &title,
		CreatedBy:          user.ID,
		MediaVisibility:    "members",
		CommentsEnabled:    &commentsEnabled,
		EncryptionProtocol: encryptionProtocol,
		CreatedAt:          now,
		MemberIDs:          memberIDs,
		CreatePreferences:  true,
	}); err != nil {
		s.logger.Errorf("chats", "create channel chat failed user_id=%s error=%v", user.ID, err)
		s.detail(w, http.StatusInternalServerError, "Could not create channel chat")
		return
	}

	chat, err := s.buildChatPublic(chatID, user)
	if err != nil {
		s.logger.Errorf("chats", "create channel chat build failed chat_id=%s user_id=%s error=%v", chatID, user.ID, err)
		s.detail(w, http.StatusInternalServerError, "Could not load created chat")
		return
	}
	s.json(w, http.StatusCreated, chat)
}

func (s *Server) handleCreateVoiceChat(w http.ResponseWriter, r *http.Request, user userPublic) {
	if !hasPermission(user, permissionManageChannels) {
		s.detail(w, http.StatusForbidden, "Permission denied")
		return
	}
	var payload createVoiceChatRequest
	if err := s.decodeJSON(r, &payload); err != nil {
		s.detail(w, http.StatusUnprocessableEntity, "Invalid request body")
		return
	}
	payload.Title = strings.TrimSpace(payload.Title)
	if payload.Title == "" {
		s.detail(w, http.StatusUnprocessableEntity, "Invalid voice chat payload")
		return
	}

	memberIDs, err := s.resolveChatMembers(user, payload.MemberIDs)
	if err != nil {
		s.detail(w, domainErrorStatus(err), "Invalid voice chat members")
		return
	}
	if err := s.validateInvitePermissions(user, memberIDs, "voice"); err != nil {
		s.detail(w, http.StatusForbidden, err.Error())
		return
	}

	chatID := uuid.NewString()
	encryptionProtocol := s.defaultMessageEncryptionProtocol(user.FamilyID)
	now := nowString()
	title := payload.Title
	commentsEnabled := true
	if err := s.store.CreateChatWithMembers(r.Context(), repository.CreateChatParams{
		ID:                 chatID,
		FamilyID:           user.FamilyID,
		Type:               "voice",
		Title:              &title,
		CreatedBy:          user.ID,
		MediaVisibility:    "members",
		CommentsEnabled:    &commentsEnabled,
		EncryptionProtocol: encryptionProtocol,
		CreatedAt:          now,
		MemberIDs:          memberIDs,
		CreatePreferences:  true,
	}); err != nil {
		s.logger.Errorf("chats", "create voice chat failed user_id=%s error=%v", user.ID, err)
		s.detail(w, http.StatusInternalServerError, "Could not create voice chat")
		return
	}

	chat, err := s.buildChatPublic(chatID, user)
	if err != nil {
		s.logger.Errorf("chats", "create voice chat build failed chat_id=%s user_id=%s error=%v", chatID, user.ID, err)
		s.detail(w, http.StatusInternalServerError, "Could not load created chat")
		return
	}
	s.json(w, http.StatusCreated, chat)
}

func (s *Server) handleUpdateChat(w http.ResponseWriter, r *http.Request, user userPublic) {
	chatID := chatIDFromURL(r)
	chat, err := s.buildChatPublic(chatID, user)
	if err != nil {
		s.detail(w, http.StatusNotFound, "Chat not found")
		return
	}

	var payload updateChatRequest
	if err := s.decodeJSON(r, &payload); err != nil {
		s.detail(w, http.StatusUnprocessableEntity, "Invalid request body")
		return
	}

	if payload.Title != nil {
		title := strings.TrimSpace(*payload.Title)
		if title == "" {
			s.detail(w, http.StatusUnprocessableEntity, "title cannot be blank")
			return
		}
		if !s.canManageChat(chat, user) {
			s.detail(w, http.StatusForbidden, "Permission denied")
			return
		}
		if err := s.store.UpdateChatTitle(r.Context(), chatID, title, nowString()); err != nil {
			s.detail(w, http.StatusInternalServerError, "Could not update chat")
			return
		}
	}

	if payload.MediaVisibility != nil {
		if err := s.updateChatMediaVisibility(r.Context(), chatID, *payload.MediaVisibility, chat, user); err != nil {
			s.detail(w, domainErrorStatus(err), err.Error())
			return
		}
	}

	if payload.ChatPhotoFileID != nil {
		chatPhotoFileID := strings.TrimSpace(*payload.ChatPhotoFileID)
		if !s.canManageChat(chat, user) {
			s.detail(w, http.StatusForbidden, "Permission denied")
			return
		}
		if chatPhotoFileID != "" {
			if err := s.validateImageFileForFamily(chatPhotoFileID, user, "Chat photo not found"); err != nil {
				s.detail(w, domainErrorStatus(err), err.Error())
				return
			}
		}
		var photoPtr *string
		if chatPhotoFileID != "" {
			photoPtr = &chatPhotoFileID
		}
		if err := s.store.UpdateChatPhoto(r.Context(), chatID, photoPtr, nowString()); err != nil {
			s.detail(w, http.StatusInternalServerError, "Could not update chat")
			return
		}
	}

	if payload.CommentsEnabled != nil {
		if chat.Type != "channel" {
			s.detail(w, http.StatusUnprocessableEntity, "comments can only be changed for channels")
			return
		}
		if !s.canManageChat(chat, user) {
			s.detail(w, http.StatusForbidden, "Permission denied")
			return
		}
		if err := s.store.UpdateChatCommentsEnabled(r.Context(), chatID, *payload.CommentsEnabled, nowString()); err != nil {
			s.detail(w, http.StatusInternalServerError, "Could not update chat")
			return
		}
	}

	if payload.PinPermission != nil {
		if !s.canManageChat(chat, user) {
			s.detail(w, http.StatusForbidden, "Permission denied")
			return
		}
		perm := *payload.PinPermission
		if perm != "everyone" && perm != "admins_only" {
			s.detail(w, http.StatusUnprocessableEntity, "pinPermission must be 'everyone' or 'admins_only'")
			return
		}
		if err := s.store.UpdateChatPinPermission(r.Context(), chatID, perm, nowString()); err != nil {
			s.detail(w, http.StatusInternalServerError, "Could not update chat")
			return
		}
	}

	if payload.MessageDelaySeconds != nil {
		if !s.canManageChat(chat, user) {
			s.detail(w, http.StatusForbidden, "Permission denied")
			return
		}
		delay := *payload.MessageDelaySeconds
		if delay < 0 || delay > 86400 {
			s.detail(w, http.StatusUnprocessableEntity, "messageDelaySeconds must be between 0 and 86400")
			return
		}
		updatedChat, err := s.store.UpdateChatMessageDelay(r.Context(), chatID, delay, nowString())
		if err != nil {
			s.detail(w, http.StatusInternalServerError, "Could not update chat")
			return
		}
		// Return the committed value directly. A second read here could observe
		// an older snapshot and make the client switch the control back to Off.
		chat.MessageDelaySeconds = updatedChat.MessageDelaySeconds
		chat.UpdatedAt = parseTime(updatedChat.UpdatedAt)
		s.json(w, http.StatusOK, chat)
		return
	}

	updated, _ := s.buildChatPublic(chatID, user)
	s.json(w, http.StatusOK, updated)
}

func (s *Server) handleAddChatMembers(w http.ResponseWriter, r *http.Request, user userPublic) {
	chatID := chatIDFromURL(r)
	chat, err := s.buildChatPublic(chatID, user)
	if err != nil {
		s.detail(w, http.StatusNotFound, "Chat not found")
		return
	}
	if chat.Type != "group" && chat.Type != "channel" && chat.Type != "voice" {
		s.detail(w, http.StatusUnprocessableEntity, "People can only be added to group, channel, or voice chats")
		return
	}
	if !hasPermission(user, permissionManageMembers) && !s.canManageChat(chat, user) {
		s.detail(w, http.StatusForbidden, "Permission denied")
		return
	}

	var payload addChatMembersRequest
	if err := s.decodeJSON(r, &payload); err != nil || len(payload.UserIDs) == 0 {
		s.detail(w, http.StatusUnprocessableEntity, "userIds are required")
		return
	}
	memberIDs, err := s.resolveChatMembers(user, payload.UserIDs)
	if err != nil {
		s.detail(w, domainErrorStatus(err), "Invalid chat members")
		return
	}
	if err := s.validateInvitePermissions(user, memberIDs, chat.Type); err != nil {
		s.detail(w, http.StatusForbidden, err.Error())
		return
	}
	if err := s.store.AddChatMembers(r.Context(), repository.AddChatMembersParams{
		ChatID: chatID, UserIDs: memberIDs, CreatedAt: nowString(),
	}); err != nil {
		s.logger.Errorf("chats", "add chat members failed chat_id=%s user_id=%s error=%v", chatID, user.ID, err)
		s.detail(w, http.StatusInternalServerError, "Could not add people to chat")
		return
	}
	updated, err := s.buildChatPublic(chatID, user)
	if err != nil {
		s.detail(w, http.StatusInternalServerError, "Could not load updated chat")
		return
	}
	s.json(w, http.StatusOK, updated)
}

func (s *Server) handleUpdateChatPreferences(w http.ResponseWriter, r *http.Request, user userPublic) {
	chatID := chatIDFromURL(r)
	if _, err := s.buildChatPublic(chatID, user); err != nil {
		s.detail(w, http.StatusNotFound, "Chat not found")
		return
	}

	var payload updateChatPreferencesRequest
	if err := s.decodeJSON(r, &payload); err != nil {
		s.detail(w, http.StatusUnprocessableEntity, "Invalid request body")
		return
	}
	if payload.WallpaperFileID != nil {
		wallpaperFileID := strings.TrimSpace(*payload.WallpaperFileID)
		if wallpaperFileID != "" {
			if err := s.validateImageFileForFamily(wallpaperFileID, user, "Wallpaper not found"); err != nil {
				s.detail(w, domainErrorStatus(err), err.Error())
				return
			}
		}
	}
	prefParams := repository.UpdateChatPreferencesParams{
		ChatID:     chatID,
		UserID:     user.ID,
		IsMuted:    payload.IsMuted,
		IsPinned:   payload.IsPinned,
		IsFavorite: payload.IsFavorite,
	}
	if payload.WallpaperFileID != nil {
		wallpaperFileID := strings.TrimSpace(*payload.WallpaperFileID)
		if wallpaperFileID == "" {
			prefParams.ClearWallpaper = true
		} else {
			prefParams.WallpaperFileID = &wallpaperFileID
		}
	}
	if err := s.store.UpdateChatPreferences(r.Context(), prefParams); err != nil {
		s.detail(w, http.StatusInternalServerError, "Could not update chat preferences")
		return
	}
	updated, _ := s.buildChatPublic(chatID, user)
	s.json(w, http.StatusOK, updated)
}

func (s *Server) handleGetMessages(w http.ResponseWriter, r *http.Request, user userPublic) {
	chatID := chatIDFromURL(r)
	if _, err := s.buildChatPublic(chatID, user); err != nil {
		s.detail(w, http.StatusNotFound, "Chat not found")
		return
	}
	limit := 20
	if raw := strings.TrimSpace(r.URL.Query().Get("limit")); raw != "" {
		value, err := strconv.Atoi(raw)
		if err != nil || value < 1 || value > 100 {
			s.detail(w, http.StatusBadRequest, "Invalid history request")
			return
		}
		limit = value
	}
	before := strings.TrimSpace(r.URL.Query().Get("before"))
	threadRootMessageID := strings.TrimSpace(r.URL.Query().Get("threadRootMessageId"))
	var cacheRevision historyCacheRevision
	if before == "" && threadRootMessageID == "" && limit == 20 {
		cacheRevision = s.chatHistoryRevisions(r.Context(), chatID, user.ID)
		if cached, ok := s.loadCachedLatestHistory(r.Context(), chatID, user.ID, cacheRevision); ok {
			s.json(w, http.StatusOK, cached)
			return
		}
	}
	messages, hasMore, err := s.listMessagesPage(chatID, user, before, limit, threadRootMessageID)
	if err != nil {
		s.detail(w, domainErrorStatus(err), "Could not load messages")
		return
	}
	page := newMessageHistoryPage(messages, hasMore)
	if before == "" && threadRootMessageID == "" && limit == 20 {
		s.cacheLatestHistory(r.Context(), chatID, user.ID, cacheRevision, page)
	}
	s.json(w, http.StatusOK, page)
}

func (s *Server) handleSendMessage(w http.ResponseWriter, r *http.Request, user userPublic) {
	chatID := chatIDFromURL(r)
	var payload sendMessageRequest
	if err := s.decodeJSON(r, &payload); err != nil {
		s.detail(w, http.StatusUnprocessableEntity, "Invalid request body")
		return
	}
	operationID := strings.TrimSpace(r.Header.Get(clientOperationHeader))
	if operationID != "" {
		if _, err := uuid.Parse(operationID); err != nil {
			s.detail(w, http.StatusBadRequest, "Invalid operation ID")
			return
		}
	}
	message, replayed, err := s.createRESTMessageWithSync(r.Context(), user, chatID, payload, operationID)
	if err != nil {
		s.detail(w, domainErrorStatus(err), err.Error())
		return
	}
	if !replayed {
		chat, chatErr := s.buildChatPublic(chatID, user)
		if chatErr == nil {
			s.notifyCreatedRESTMessage(chat, user, message, payload)
		}
		s.bumpChatHistoryRevision(r.Context(), chatID)
	}
	s.json(w, http.StatusCreated, message)
}

func (s *Server) handleMarkMessageRead(w http.ResponseWriter, r *http.Request, user userPublic) {
	message, chatID, err := s.markMessageRead(r.Context(), user, messageIDFromURL(r))
	if err != nil {
		if errors.Is(err, errNotFound) {
			s.json(w, http.StatusOK, map[string]any{"status": "ok"})
			return
		}
		s.detail(w, domainErrorStatus(err), err.Error())
		return
	}
	s.emitMessageRead(chatID, message.ID, user.ID)
	s.bumpChatHistoryRevision(r.Context(), chatID)
	s.json(w, http.StatusOK, message)
}

func (s *Server) handleForwardMessage(w http.ResponseWriter, r *http.Request, user userPublic) {
	var payload forwardMessageRequest
	if err := s.decodeJSON(r, &payload); err != nil {
		s.detail(w, http.StatusUnprocessableEntity, "Invalid request body")
		return
	}
	payload.ChatID = strings.TrimSpace(payload.ChatID)
	if payload.ChatID == "" {
		s.detail(w, http.StatusUnprocessableEntity, "chatId is required")
		return
	}

	message, err := s.forwardMessage(r.Context(), user, messageIDFromURL(r), payload.ChatID)
	if err != nil {
		s.detail(w, domainErrorStatus(err), err.Error())
		return
	}
	s.json(w, http.StatusCreated, message)
}

func (s *Server) handleGetMessageArchive(w http.ResponseWriter, _ *http.Request, user userPublic) {
	archive, err := s.ensureMessageArchive(user)
	if err != nil {
		s.detail(w, http.StatusInternalServerError, "Could not load Message Archive")
		return
	}
	s.json(w, http.StatusOK, archive)
}

func (s *Server) handleArchiveMessage(w http.ResponseWriter, r *http.Request, user userPublic) {
	archive, err := s.ensureMessageArchive(user)
	if err != nil {
		s.detail(w, http.StatusInternalServerError, "Could not load Message Archive")
		return
	}
	existingID, err := s.store.FindActiveForwardInChat(r.Context(), archive.ID, messageIDFromURL(r))
	if err == nil {
		message, buildErr := s.buildMessage(existingID, user.ID)
		if buildErr != nil {
			s.detail(w, http.StatusInternalServerError, "Could not save message")
			return
		}
		s.json(w, http.StatusOK, message)
		return
	}
	if !isMissing(err) {
		s.detail(w, http.StatusInternalServerError, "Could not save message")
		return
	}
	message, err := s.forwardMessage(r.Context(), user, messageIDFromURL(r), archive.ID)
	if err != nil {
		s.detail(w, domainErrorStatus(err), err.Error())
		return
	}
	s.json(w, http.StatusCreated, message)
}

func (s *Server) handleAddMessageReaction(w http.ResponseWriter, r *http.Request, user userPublic) {
	var payload messageReactionRequest
	if err := s.decodeJSON(r, &payload); err != nil {
		s.detail(w, http.StatusUnprocessableEntity, "Invalid request body")
		return
	}

	message, err := s.setMessageReaction(r.Context(), user, messageIDFromURL(r), payload.Emoji, true)
	if err != nil {
		s.detail(w, domainErrorStatus(err), err.Error())
		return
	}
	s.emitMessageUpdated(message.ChatID, message)
	s.bumpChatHistoryRevision(r.Context(), message.ChatID)
	s.json(w, http.StatusOK, message)
}

func (s *Server) handleRemoveMessageReaction(w http.ResponseWriter, r *http.Request, user userPublic) {
	message, err := s.setMessageReaction(r.Context(), user, messageIDFromURL(r), chi.URLParam(r, "emoji"), false)
	if err != nil {
		s.detail(w, domainErrorStatus(err), err.Error())
		return
	}
	s.emitMessageUpdated(message.ChatID, message)
	s.bumpChatHistoryRevision(r.Context(), message.ChatID)
	s.json(w, http.StatusOK, message)
}

func (s *Server) canManageChat(chat chatPublic, user userPublic) bool {
	if chat.Type == "direct" {
		return false
	}
	if hasPermission(user, permissionManageChannels) {
		return true
	}
	return (chat.Type == "group" || chat.Type == "channel" || chat.Type == "voice") && chat.CreatedBy != nil && *chat.CreatedBy == user.ID
}

func (s *Server) canSendToChat(chat chatPublic, user userPublic) bool {
	if chat.Type != "channel" {
		return true
	}
	if user.Role == connectorRole {
		return true
	}
	return isAdmin(user.Role) || (chat.CreatedBy != nil && *chat.CreatedBy == user.ID)
}

func (s *Server) resolveChatMembers(user userPublic, rawMemberIDs []string) ([]string, error) {
	memberIDs := []string{user.ID}
	seen := map[string]struct{}{user.ID: {}}
	for _, memberID := range rawMemberIDs {
		memberID = strings.TrimSpace(memberID)
		if memberID == "" {
			continue
		}
		if _, ok := seen[memberID]; ok {
			continue
		}
		member, err := s.getUserByID(memberID)
		if err != nil || member.FamilyID != user.FamilyID || !member.IsActive {
			return nil, errBadRequest
		}
		seen[memberID] = struct{}{}
		memberIDs = append(memberIDs, memberID)
	}
	return memberIDs, nil
}

func (s *Server) listChats(user userPublic) ([]chatPublic, error) {
	// The archive is a first-class personal chat: it exists as soon as the
	// user loads their chat list, rather than only after their first save.
	if _, err := s.ensureMessageArchive(user); err != nil {
		return nil, err
	}
	rows, err := s.store.ListChatsForUser(context.Background(), user.ID)
	if err != nil {
		return nil, err
	}

	chats := make([]chatPublic, 0, len(rows))
	for _, row := range rows {
		chat, err := s.buildChatPublicFromRow(row, user)
		if err == nil {
			chats = append(chats, chat)
		}
	}

	slices.SortFunc(chats, func(a, b chatPublic) int {
		if (a.Type == "archive") != (b.Type == "archive") {
			if a.Type == "archive" {
				return -1
			}
			return 1
		}
		if a.IsPinned != b.IsPinned {
			if a.IsPinned {
				return -1
			}
			return 1
		}
		if a.UpdatedAt.After(b.UpdatedAt) {
			return -1
		}
		if a.UpdatedAt.Before(b.UpdatedAt) {
			return 1
		}
		return 0
	})
	return chats, nil
}

func (s *Server) ensureMessageArchive(user userPublic) (chatPublic, error) {
	chatID, err := s.store.FindArchiveChatID(context.Background(), user.FamilyID, user.ID)
	if err == nil {
		return s.buildChatPublic(chatID, user)
	}
	if !isMissing(err) {
		return chatPublic{}, err
	}
	chatID = uuid.NewString()
	now := nowString()
	title := "Message Archive"
	if err := s.store.CreateChatWithMembers(context.Background(), repository.CreateChatParams{
		ID:                 chatID,
		FamilyID:           user.FamilyID,
		Type:               "archive",
		Title:              &title,
		CreatedBy:          user.ID,
		MediaVisibility:    "members",
		EncryptionProtocol: s.defaultMessageEncryptionProtocol(user.FamilyID),
		CreatedAt:          now,
		MemberIDs:          []string{user.ID},
		CreatePreferences:  false,
	}); err != nil {
		return chatPublic{}, err
	}
	return s.buildChatPublic(chatID, user)
}

func (s *Server) buildChatPublic(chatID string, user userPublic) (chatPublic, error) {
	row, err := s.store.GetChatForMember(context.Background(), chatID, user.ID)
	if err != nil {
		return chatPublic{}, err
	}
	return s.buildChatPublicFromRow(row, user)
}

func (s *Server) buildChatPublicFromRow(row *repository.ChatForMember, user userPublic) (chatPublic, error) {
	c := row.Chat
	if c.FamilyID != user.FamilyID {
		return chatPublic{}, errNotFound
	}

	var chat chatPublic
	chat.ID = c.ID
	chat.FamilyID = c.FamilyID
	chat.Type = c.Type
	chat.Title = c.Title
	chat.CreatedBy = c.CreatedBy
	chat.MediaVisibility = c.MediaVisibility
	chat.EncryptionProtocol = c.EncryptionProtocol
	chat.CreatedAt = parseTime(c.CreatedAt)
	chat.UpdatedAt = parseTime(c.UpdatedAt)
	chat.CommentsEnabled = c.CommentsEnabled
	if c.ChatPhotoFileID != nil && *c.ChatPhotoFileID != "" {
		if file, err := s.buildFilePublic(*c.ChatPhotoFileID, user.ID); err == nil && file.DeletedAt == nil {
			chat.ChatPhoto = &file
		}
	}
	if row.Preference != nil {
		chat.IsMuted = row.Preference.IsMuted
		chat.IsPinned = row.Preference.IsPinned
		chat.IsFavorite = row.Preference.IsFavorite
		if row.Preference.WallpaperFileID != nil && *row.Preference.WallpaperFileID != "" {
			if file, err := s.buildFilePublic(*row.Preference.WallpaperFileID, user.ID); err == nil && file.DeletedAt == nil {
				chat.Wallpaper = &file
			}
		}
	}
	if c.PinPermission != "" {
		chat.PinPermission = c.PinPermission
	} else {
		chat.PinPermission = "everyone"
	}
	chat.MessageDelaySeconds = c.MessageDelaySeconds

	members, err := s.chatMembers(chat.ID)
	if err != nil {
		return chatPublic{}, err
	}
	chat.Members = members

	unread, err := s.unreadCount(chat.ID, user.ID)
	if err != nil {
		return chatPublic{}, err
	}
	chat.UnreadCount = unread
	if err := s.populateLastMessagePreview(&chat); err != nil {
		return chatPublic{}, err
	}

	if chat.Type == "direct" {
		chat.MediaVisibilityApprovalRequired = 2
		count, approved, err := s.directApprovalStatus(chat.ID, user.ID)
		if err != nil {
			return chatPublic{}, err
		}
		chat.MediaVisibilityApprovalCount = count
		chat.MyMediaVisibilityApproval = approved
		chat.MediaVisibilityPendingApproval = chat.MediaVisibility != "family" && count > 0
	} else {
		chat.MediaVisibilityApprovalRequired = 0
		chat.MediaVisibilityApprovalCount = 0
		chat.MyMediaVisibilityApproval = chat.MediaVisibility == "family"
		chat.MediaVisibilityPendingApproval = false
	}

	if sess, ok := s.getCallSession(chat.ID); ok && sess != nil {
		chat.ActiveCall = sess.publicPayload()
	}

	return chat, nil
}

func (s *Server) populateLastMessagePreview(chat *chatPublic) error {
	preview, err := s.store.GetLastMessagePreview(context.Background(), chat.ID)
	if err != nil {
		if isMissing(err) {
			return nil
		}
		return err
	}
	chat.LastMessageID = &preview.ID
	chat.LastMessageSenderID = &preview.SenderID
	chat.LastMessageSenderDisplayName = preview.SenderName
	chat.LastMessageType = &preview.Type
	derived := deriveMessagePreview(preview.Content, preview.Type, preview.AttachmentCount)
	chat.LastMessageContent = &derived
	timestamp := parseTime(preview.CreatedAt)
	chat.LastMessageCreatedAt = &timestamp
	return nil
}

func deriveMessagePreview(content *string, messageType string, attachmentCount int) string {
	trimmed := ""
	if content != nil {
		trimmed = strings.TrimSpace(*content)
	}
	if trimmed != "" {
		return trimmed
	}
	if attachmentCount > 1 {
		return fmt.Sprintf("%d attachments", attachmentCount)
	}
	switch messageType {
	case "call":
		return "Call"
	case "image":
		return "Photo"
	case "video":
		return "Video"
	case "file":
		return "File"
	case "mixed":
		if attachmentCount == 1 {
			return "Attachment"
		}
		return "Message"
	default:
		return "Message"
	}
}

func (s *Server) defaultMessageEncryptionProtocol(familyID string) string {
	family, err := s.getFamily(familyID)
	if err != nil {
		return encryptionProtocolServerAtRest
	}
	protocol, err := normalizeEncryptionProtocol(family.DefaultMessageEncryptionProtocol)
	if err != nil {
		return encryptionProtocolServerAtRest
	}
	return protocol
}

func (s *Server) chatMembers(chatID string) ([]chatMemberPublic, error) {
	users, err := s.store.ListActiveChatMemberUsers(context.Background(), chatID)
	if err != nil {
		return nil, err
	}

	members := make([]chatMemberPublic, 0, len(users))
	presence := cache.NewPresenceService(s.cache)
	for _, u := range users {
		username := u.Username
		if u.Role == connectorRole {
			if alias, aliasErr := s.store.MCPConnectorAliasForActor(context.Background(), u.ID); aliasErr == nil && alias != "" {
				// Keep the generated account username private; the configured alias is
				// the stable, user-facing name that @-mentions resolve against.
				username = alias
			}
		}
		member := chatMemberPublic{
			ID:                 u.ID,
			DisplayName:        u.DisplayName,
			Username:           username,
			Role:               u.Role,
			PublicKey:          u.PublicKey,
			LastSeenVisibility: u.LastSeenVisibility,
		}
		if u.LastSeenAt != nil {
			lastSeen := parseTime(*u.LastSeenAt)
			member.LastSeenAt = &lastSeen
		}
		member.IsOnline, _ = presence.IsOnline(context.Background(), u.ID)
		if u.ProfilePhotoFileID != nil {
			if file, err := s.buildFilePublic(*u.ProfilePhotoFileID, member.ID); err == nil && file.DeletedAt == nil {
				member.ProfilePhoto = &file
			}
		}
		members = append(members, member)
	}
	return members, nil
}

func (s *Server) unreadCount(chatID, userID string) (int, error) {
	return s.store.UnreadMessageCount(context.Background(), chatID, userID)
}

func (s *Server) directApprovalStatus(chatID, userID string) (int, bool, error) {
	ids, err := s.store.ListMediaApprovalUserIDs(context.Background(), chatID)
	if err != nil {
		return 0, false, err
	}
	approved := false
	for _, actorID := range ids {
		if actorID == userID {
			approved = true
			break
		}
	}
	return len(ids), approved, nil
}

func (s *Server) findDirectChat(userA, userB string) (string, error) {
	chatIDs, err := s.store.ListDirectChatIDs(context.Background())
	if err != nil {
		return "", err
	}

	target := []string{userA, userB}
	slices.Sort(target)
	for _, chatID := range chatIDs {
		members, err := s.chatMembers(chatID)
		if err != nil || len(members) != 2 {
			continue
		}
		ids := []string{members[0].ID, members[1].ID}
		slices.Sort(ids)
		if ids[0] == target[0] && ids[1] == target[1] {
			return chatID, nil
		}
	}
	return "", errNotFound
}

func (s *Server) updateChatMediaVisibility(ctx context.Context, chatID string, desired string, chat chatPublic, user userPublic) error {
	if desired != "family" && desired != "members" {
		return fmt.Errorf("invalid media visibility")
	}
	switch chat.Type {
	case "family":
		return fmt.Errorf("family chat media visibility is fixed")
	case "group", "channel":
		if !s.canManageChat(chat, user) {
			return errForbidden
		}
		return s.store.SetChatMediaVisibility(ctx, chatID, desired, nowString())
	case "direct":
		if desired == "members" {
			return s.store.SetChatMediaVisibility(ctx, chatID, "members", nowString())
		}
		return s.store.ApproveDirectMediaVisibility(ctx, chatID, user.ID, nowString(), nowString())
	default:
		return errBadRequest
	}
}

func (s *Server) listMessages(chatID string, user userPublic, before string, limit int, threadRootMessageID string) ([]messagePublic, error) {
	messages, _, err := s.listMessagesPage(chatID, user, before, limit, threadRootMessageID)
	return messages, err
}

func (s *Server) listMessagesPage(chatID string, user userPublic, before string, limit int, threadRootMessageID string) ([]messagePublic, bool, error) {
	if threadRootMessageID != "" {
		if err := s.validateReplyTarget(chatID, threadRootMessageID); err != nil {
			return nil, false, err
		}
	}
	beforeCreatedAt := ""
	if before != "" {
		createdAt, err := s.store.MessageCreatedAtInChat(context.Background(), before, chatID)
		if err != nil {
			return nil, false, errBadRequest
		}
		beforeCreatedAt = createdAt
	}
	ids, err := s.store.ListMessageIDsPage(context.Background(), repository.ListMessageIDsPageParams{
		ChatID:              chatID,
		ViewerID:            user.ID,
		BeforeCreatedAt:     beforeCreatedAt,
		ThreadRootMessageID: threadRootMessageID,
		Limit:               limit + 1,
	})
	if err != nil {
		return nil, false, err
	}
	slices.Reverse(ids)
	hasMore := len(ids) > limit
	if hasMore {
		ids = ids[1:]
	}
	messages := make([]messagePublic, 0, len(ids))
	for _, messageID := range ids {
		message, err := s.buildMessage(messageID, user.ID)
		if err != nil {
			return nil, false, err
		}
		messages = append(messages, message)
	}
	rootMessageIDs := make([]string, 0, len(messages))
	for _, message := range messages {
		if message.MessageKind == "chat" {
			rootMessageIDs = append(rootMessageIDs, message.ID)
		}
	}
	commentCounts, err := s.store.CountThreadMessagesByRootIDs(context.Background(), chatID, rootMessageIDs)
	if err != nil {
		return nil, false, err
	}
	for index := range messages {
		if messages[index].MessageKind == "chat" {
			messages[index].CommentCount = commentCounts[messages[index].ID]
		}
	}
	return messages, hasMore, nil
}

func (s *Server) validateInvitePermissions(inviter userPublic, memberIDs []string, chatType string) error {
	for _, memberID := range memberIDs {
		if memberID == inviter.ID {
			continue
		}
		target, err := s.getUserByID(memberID)
		if err != nil {
			return err
		}
		if !contactPermissionAllows(target, inviter.ID, chatType) {
			return fmt.Errorf("%s does not accept this invitation", target.DisplayName)
		}
	}
	return nil
}

func (s *Server) createMessage(ctx context.Context, user userPublic, chatID string, clientMessageID *string, r *http.Request) (messagePublic, error) {
	var payload sendMessageRequest
	if r != nil {
		if err := s.decodeJSON(r, &payload); err != nil {
			return messagePublic{}, newStatusError(http.StatusUnprocessableEntity, "Invalid request body")
		}
	}
	return s.createMessageWithPayloadContext(ctx, user, chatID, payload, clientMessageID, nil)
}

func (s *Server) buildMessage(messageID, viewerID string) (messagePublic, error) {
	m, err := s.store.LoadMessage(context.Background(), messageID)
	if err != nil {
		return messagePublic{}, err
	}
	if m.Edges.Chat == nil {
		return messagePublic{}, errNotFound
	}
	familyID := m.Edges.Chat.FamilyID

	var message messagePublic
	message.ID = m.ID
	message.ChatID = m.ChatID
	message.SenderID = m.SenderID
	if m.Edges.Sender != nil {
		name := m.Edges.Sender.DisplayName
		message.SenderDisplayName = &name
	}
	message.Type = m.Type
	message.Content = m.Content
	message.EncryptionProtocol = encryptionProtocolLegacyPlain
	if m.EncryptionProtocol != "" {
		message.EncryptionProtocol = m.EncryptionProtocol
	}
	message.Ciphertext = m.Ciphertext
	message.Nonce = m.Nonce
	message.EncryptionMetadata = m.EncryptionMetadata
	if message.Type == "call" && m.EncryptionMetadata != nil {
		var call callHistoryPublic
		if err := json.Unmarshal([]byte(*m.EncryptionMetadata), &call); err == nil {
			message.Call = &call
		}
	}
	message.KeyVersion = m.KeyVersion
	if message.EncryptionProtocol == encryptionProtocolServerAtRest && message.Ciphertext != nil && message.Nonce != nil {
		decrypted, err := s.decryptServerAtRest(familyID, *message.Ciphertext, *message.Nonce)
		if err == nil {
			message.Content = decrypted
		}
		message.Ciphertext = nil
		message.Nonce = nil
		message.EncryptionMetadata = nil
	}
	message.ReplyToMessageID = m.ReplyToMessageID
	message.ThreadRootMessageID = m.ThreadRootMessageID
	message.MessageKind = "chat"
	if strings.TrimSpace(m.MessageKind) != "" {
		message.MessageKind = m.MessageKind
	}
	message.CreatedAt = parseTime(m.CreatedAt)
	message.UpdatedAt = parseTime(m.UpdatedAt)
	if m.ForwardedFromMessageID != nil && m.ForwardedFromChatID != nil {
		message.ForwardedFrom = &messageForwardPublic{
			MessageID: *m.ForwardedFromMessageID,
			ChatID:    *m.ForwardedFromChatID,
		}
		senderID, senderName, err := s.store.LoadMessageSender(context.Background(), *m.ForwardedFromMessageID)
		if err == nil {
			message.ForwardedFrom.SenderID = senderID
			message.ForwardedFrom.SenderDisplayName = senderName
		}
	}
	if m.DeletedAt != nil {
		deleted := parseTime(*m.DeletedAt)
		message.DeletedAt = &deleted
	}
	message.IsEdited = m.IsEdited

	statuses, err := s.store.ListMessageStatuses(context.Background(), messageID)
	if err != nil {
		return messagePublic{}, err
	}
	message.Statuses = make([]messageStatusPublic, 0, len(statuses))
	for _, status := range statuses {
		message.Statuses = append(message.Statuses, messageStatusPublic{
			UserID:    status.UserID,
			Status:    status.Status,
			CreatedAt: parseTime(status.CreatedAt),
		})
	}

	reactions, err := s.store.ListMessageReactions(context.Background(), messageID)
	if err != nil {
		return messagePublic{}, err
	}
	message.Reactions = make([]messageReactionPublic, 0)
	reactionIndex := make(map[string]int)
	for _, reaction := range reactions {
		index, ok := reactionIndex[reaction.Emoji]
		if !ok {
			reactionIndex[reaction.Emoji] = len(message.Reactions)
			message.Reactions = append(message.Reactions, messageReactionPublic{
				Emoji:   reaction.Emoji,
				UserIDs: make([]string, 0, 1),
			})
			index = len(message.Reactions) - 1
		}
		message.Reactions[index].Count++
		message.Reactions[index].UserIDs = append(message.Reactions[index].UserIDs, reaction.UserID)
		if reaction.UserID == viewerID {
			message.Reactions[index].Reacted = true
		}
	}

	fileIDs, err := s.store.ListMessageAttachmentFileIDs(context.Background(), messageID)
	if err != nil {
		return messagePublic{}, err
	}
	message.Attachments = make([]filePublic, 0, len(fileIDs))
	for _, fileID := range fileIDs {
		file, err := s.buildFilePublic(fileID, viewerID)
		if err == nil {
			message.Attachments = append(message.Attachments, file)
		}
	}
	return message, nil
}

func (s *Server) loadAttachmentsForMessage(fileIDs []string, user userPublic, chatID string) ([]filePublic, error) {
	uniqueFileIDs := uniqueAttachmentFileIDs(fileIDs)
	files := make([]filePublic, 0, len(uniqueFileIDs))
	for _, fileID := range uniqueFileIDs {
		file, err := s.buildFilePublic(fileID, user.ID)
		if err != nil || file.DeletedAt != nil {
			return nil, fmt.Errorf("invalid file attachment")
		}
		if file.ChatID != nil && *file.ChatID != chatID {
			return nil, fmt.Errorf("file does not belong to this chat")
		}
		files = append(files, file)
	}
	return files, nil
}

// uniqueAttachmentFileIDs prevents a repeated file reference from creating the
// same (message_id, file_id) association more than once. This can happen when a
// client retries or merges gallery selections, and must not prevent the message
// from being sent with its distinct attachments.
func uniqueAttachmentFileIDs(fileIDs []string) []string {
	seen := make(map[string]struct{}, len(fileIDs))
	unique := make([]string, 0, len(fileIDs))
	for _, fileID := range fileIDs {
		if _, ok := seen[fileID]; ok {
			continue
		}
		seen[fileID] = struct{}{}
		unique = append(unique, fileID)
	}
	return unique
}

func (s *Server) markMessageRead(ctx context.Context, user userPublic, messageID string) (messagePublic, string, error) {
	meta, err := s.store.GetActiveMessageMeta(ctx, messageID)
	if err != nil {
		return messagePublic{}, "", errNotFound
	}
	if _, err := s.buildChatPublic(meta.ChatID, user); err != nil {
		return messagePublic{}, "", errNotFound
	}

	if err := s.store.MarkMessagesRead(ctx, meta.ChatID, user.ID, meta.ID, meta.CreatedAt, nowString(), meta.SenderID == user.ID); err != nil {
		return messagePublic{}, "", err
	}

	message, err := s.buildMessage(messageID, user.ID)
	if err != nil {
		return messagePublic{}, "", err
	}
	return message, meta.ChatID, nil
}

func (s *Server) forwardMessage(ctx context.Context, user userPublic, sourceMessageID, targetChatID string) (messagePublic, error) {
	sourceMessage, err := s.buildMessage(sourceMessageID, user.ID)
	if err != nil {
		return messagePublic{}, errNotFound
	}
	if _, err := s.buildChatPublic(sourceMessage.ChatID, user); err != nil {
		return messagePublic{}, errNotFound
	}
	targetChat, err := s.buildChatPublic(targetChatID, user)
	if err != nil {
		return messagePublic{}, errNotFound
	}
	if !s.canSendToChat(targetChat, user) {
		return messagePublic{}, errForbidden
	}
	if sourceMessage.EncryptionProtocol == encryptionProtocolEndToEnd && sourceMessage.Content == nil && sourceMessage.Ciphertext != nil {
		return messagePublic{}, fmt.Errorf("end-to-end encrypted messages must be forwarded from the client")
	}

	clonedFileIDs, cleanup, err := s.cloneForwardAttachments(ctx, user, targetChat, sourceMessage)
	if err != nil {
		return messagePublic{}, err
	}
	payload := sendMessageRequest{
		Type:    sourceMessage.Type,
		Content: sourceMessage.Content,
		FileIDs: clonedFileIDs,
	}
	message, err := s.createMessageWithPayload(user, targetChatID, payload, nil, &messageForwardSource{
		MessageID: sourceMessage.ID,
		ChatID:    sourceMessage.ChatID,
	})
	if err != nil {
		cleanup()
		return messagePublic{}, err
	}
	return message, nil
}

func (s *Server) cloneForwardAttachments(ctx context.Context, user userPublic, targetChat chatPublic, sourceMessage messagePublic) ([]string, func(), error) {
	if len(sourceMessage.Attachments) == 0 {
		return nil, func() {}, nil
	}

	type clonedFile struct {
		ID                 string
		ObjectKey          string
		ThumbnailObjectKey *string
		StorageProvider    string
		OriginalName       string
		MimeType           string
		SizeBytes          int64
		Checksum           *string
	}

	now := nowString()
	clones := make([]clonedFile, 0, len(sourceMessage.Attachments))
	for _, attachment := range sourceMessage.Attachments {
		file, sourceObjectKey, err := s.loadFileRecord(ctx, attachment.ID, user.ID)
		if err != nil || file.DeletedAt != nil {
			return nil, func() {}, fmt.Errorf("invalid file attachment")
		}
		data, err := s.storage.Read(sourceObjectKey)
		if err != nil {
			return nil, func() {}, fmt.Errorf("invalid file attachment")
		}

		objectKey := path.Join(
			"family",
			targetChat.FamilyID,
			"chats",
			targetChat.ID,
			time.Now().UTC().Format("2006"),
			time.Now().UTC().Format("01"),
			uuid.NewString()+"-"+sanitizeFilename(file.OriginalName),
		)
		if err := s.storage.Save(objectKey, data); err != nil {
			for _, clone := range clones {
				deleteFileObjects(s.storage, clone.ObjectKey, clone.ThumbnailObjectKey)
			}
			return nil, func() {}, err
		}
		var thumbnailObjectKey *string
		if file.ThumbnailObjectKey != nil {
			if thumbnail, err := s.storage.Read(*file.ThumbnailObjectKey); err == nil {
				key := objectKey + ".thumbnail.jpg"
				if err := s.storage.Save(key, thumbnail); err == nil {
					thumbnailObjectKey = &key
				}
			}
		}
		clones = append(clones, clonedFile{
			ID:                 uuid.NewString(),
			ObjectKey:          objectKey,
			ThumbnailObjectKey: thumbnailObjectKey,
			StorageProvider:    file.StorageProvider,
			OriginalName:       file.OriginalName,
			MimeType:           file.MimeType,
			SizeBytes:          int64(len(data)),
			Checksum:           file.Checksum,
		})
	}

	if err := s.store.WithTx(ctx, func(tx *ent.Tx) error {
		for _, clone := range clones {
			chatID := targetChat.ID
			if err := s.store.CreateFile(ctx, tx, repository.CreateFileParams{
				ID:                 clone.ID,
				FamilyID:           targetChat.FamilyID,
				UploadedBy:         user.ID,
				ChatID:             &chatID,
				AccessScope:        "chat",
				StorageProvider:    clone.StorageProvider,
				ObjectKey:          clone.ObjectKey,
				ThumbnailObjectKey: clone.ThumbnailObjectKey,
				OriginalName:       clone.OriginalName,
				MimeType:           clone.MimeType,
				SizeBytes:          int(clone.SizeBytes),
				Checksum:           clone.Checksum,
				CreatedAt:          now,
			}); err != nil {
				return err
			}
		}
		return nil
	}); err != nil {
		for _, clone := range clones {
			deleteFileObjects(s.storage, clone.ObjectKey, clone.ThumbnailObjectKey)
		}
		return nil, func() {}, err
	}

	fileIDs := make([]string, 0, len(clones))
	for _, clone := range clones {
		fileIDs = append(fileIDs, clone.ID)
	}
	cleanup := func() {
		for _, clone := range clones {
			_ = s.store.HardDeleteFile(context.Background(), clone.ID)
			deleteFileObjects(s.storage, clone.ObjectKey, clone.ThumbnailObjectKey)
		}
	}
	return fileIDs, cleanup, nil
}

func (s *Server) setMessageReaction(ctx context.Context, user userPublic, messageID, emoji string, add bool) (messagePublic, error) {
	emoji = strings.TrimSpace(emoji)
	if emoji == "" || len([]rune(emoji)) > 32 {
		return messagePublic{}, newStatusError(http.StatusUnprocessableEntity, "emoji is required")
	}

	meta, err := s.store.GetActiveMessageMeta(ctx, messageID)
	if err != nil {
		return messagePublic{}, errNotFound
	}
	if _, err := s.buildChatPublic(meta.ChatID, user); err != nil {
		return messagePublic{}, errNotFound
	}

	if add {
		if err := s.store.SetMessageReaction(ctx, messageID, user.ID, emoji, nowString()); err != nil {
			return messagePublic{}, err
		}
	} else if err := s.store.RemoveMessageReaction(ctx, messageID, user.ID, emoji); err != nil {
		return messagePublic{}, err
	}

	message, err := s.buildMessage(messageID, user.ID)
	if err != nil {
		return messagePublic{}, err
	}
	return message, nil
}

func (s *Server) handleEditMessage(w http.ResponseWriter, r *http.Request, user userPublic) {
	messageID := messageIDFromURL(r)

	var payload editMessageRequest
	if err := s.decodeJSON(r, &payload); err != nil {
		s.detail(w, http.StatusUnprocessableEntity, "Invalid request body")
		return
	}

	content := strings.TrimSpace(payload.Content)
	if content == "" {
		s.detail(w, http.StatusUnprocessableEntity, "content is required")
		return
	}
	if len(content) > 4000 {
		s.detail(w, http.StatusUnprocessableEntity, "content exceeds maximum length of 4000 characters")
		return
	}

	meta, err := s.store.GetActiveMessageMeta(r.Context(), messageID)
	if err != nil {
		s.detail(w, http.StatusNotFound, "Message not found")
		return
	}
	if meta.SenderID != user.ID {
		s.detail(w, http.StatusForbidden, "You can only edit your own messages")
		return
	}

	chat, err := s.buildChatPublic(meta.ChatID, user)
	if err != nil {
		s.detail(w, http.StatusNotFound, "Chat not found")
		return
	}

	now := nowString()
	if chat.EncryptionProtocol == encryptionProtocolServerAtRest {
		ciphertext, nonce, err := s.encryptServerAtRest(chat.FamilyID, content)
		if err != nil {
			s.detail(w, http.StatusInternalServerError, "Encryption failed")
			return
		}
		if err := s.store.UpdateMessageEncryptedContent(r.Context(), repository.UpdateMessageEncryptedContentParams{
			MessageID:          messageID,
			Ciphertext:         ciphertext,
			Nonce:              nonce,
			KeyVersion:         1,
			EncryptionMetadata: messageEncryptionMetadataServer,
			UpdatedAt:          now,
		}); err != nil {
			s.detail(w, http.StatusInternalServerError, "Failed to update message")
			return
		}
	} else if err := s.store.UpdateMessagePlainContent(r.Context(), messageID, content, now); err != nil {
		s.detail(w, http.StatusInternalServerError, "Failed to update message")
		return
	}

	message, err := s.buildMessage(messageID, user.ID)
	if err != nil {
		s.detail(w, http.StatusInternalServerError, "Failed to load updated message")
		return
	}
	s.emitMessageUpdated(meta.ChatID, message)
	s.bumpChatHistoryRevision(r.Context(), meta.ChatID)
	s.json(w, http.StatusOK, message)
}

func (s *Server) handleDeleteMessage(w http.ResponseWriter, r *http.Request, user userPublic) {
	messageID := messageIDFromURL(r)
	scope := r.URL.Query().Get("scope")

	meta, err := s.store.GetActiveMessageMeta(r.Context(), messageID)
	if err != nil {
		s.detail(w, http.StatusNotFound, "Message not found")
		return
	}
	if meta.SenderID != user.ID {
		s.detail(w, http.StatusForbidden, "You can only delete your own messages")
		return
	}

	if scope == "me" {
		if err := s.store.UpsertMessageUserDeletion(r.Context(), messageID, user.ID, nowString()); err != nil {
			s.detail(w, http.StatusInternalServerError, "Failed to delete message")
			return
		}
		s.bumpUserChatHistoryRevision(r.Context(), user.ID, meta.ChatID)
	} else {
		if err := s.store.SoftDeleteMessage(r.Context(), messageID, nowString()); err != nil {
			s.detail(w, http.StatusInternalServerError, "Failed to delete message")
			return
		}
		s.emitMessageDeleted(meta.ChatID, messageID)
		s.bumpChatHistoryRevision(r.Context(), meta.ChatID)
	}

	s.json(w, http.StatusOK, map[string]string{"messageId": messageID, "chatId": meta.ChatID})
}
