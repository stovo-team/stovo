package app

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"path"
	"slices"
	"strconv"
	"strings"
	"time"

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
		s.detail(w, http.StatusInternalServerError, "Could not load chats")
		return
	}
	s.json(w, http.StatusOK, chats)
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

	if existingID, err := s.findDirectChat(user.ID, target.ID); err == nil {
		chat, _ := s.buildChatPublic(existingID, user)
		s.json(w, http.StatusCreated, chat)
		return
	}

	encryptionProtocol := s.defaultMessageEncryptionProtocol(user.FamilyID)
	chatID := uuid.NewString()
	now := nowString()
	if err := s.withTx(r.Context(), func(tx *sql.Tx) error {
		if _, err := s.txExec(tx, `
			INSERT INTO chats (id, family_id, type, title, created_by, media_visibility, encryption_protocol, created_at, updated_at)
			VALUES (?, ?, 'direct', NULL, ?, 'members', ?, ?, ?)
		`, chatID, user.FamilyID, user.ID, encryptionProtocol, now, now); err != nil {
			return err
		}
		for _, memberID := range []string{user.ID, target.ID} {
			if _, err := s.txExec(tx, `INSERT INTO chat_members (chat_id, user_id, created_at) VALUES (?, ?, ?)`, chatID, memberID, now); err != nil {
				return err
			}
			if _, err := s.txExec(tx, `INSERT INTO chat_preferences (chat_id, user_id) VALUES (?, ?)`, chatID, memberID); err != nil {
				return err
			}
		}
		return nil
	}); err != nil {
		s.detail(w, http.StatusInternalServerError, "Could not create direct chat")
		return
	}

	chat, _ := s.buildChatPublic(chatID, user)
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

	chatID := uuid.NewString()
	encryptionProtocol := s.defaultMessageEncryptionProtocol(user.FamilyID)
	now := nowString()
	if err := s.withTx(r.Context(), func(tx *sql.Tx) error {
		if _, err := s.txExec(tx, `
			INSERT INTO chats (id, family_id, type, title, created_by, media_visibility, encryption_protocol, created_at, updated_at)
			VALUES (?, ?, 'group', ?, ?, 'family', ?, ?, ?)
		`, chatID, user.FamilyID, payload.Title, user.ID, encryptionProtocol, now, now); err != nil {
			return err
		}
		for _, memberID := range memberIDs {
			if _, err := s.txExec(tx, `INSERT INTO chat_members (chat_id, user_id, created_at) VALUES (?, ?, ?)`, chatID, memberID, now); err != nil {
				return err
			}
			if _, err := s.txExec(tx, `INSERT INTO chat_preferences (chat_id, user_id) VALUES (?, ?)`, chatID, memberID); err != nil {
				return err
			}
		}
		return nil
	}); err != nil {
		s.detail(w, http.StatusInternalServerError, "Could not create group chat")
		return
	}

	chat, _ := s.buildChatPublic(chatID, user)
	s.json(w, http.StatusCreated, chat)
}

func (s *Server) handleCreateChannelChat(w http.ResponseWriter, r *http.Request, user userPublic) {
	if err := s.requireAdmin(user); err != nil {
		s.detail(w, http.StatusForbidden, "Owner or admin access required")
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

	chatID := uuid.NewString()
	encryptionProtocol := s.defaultMessageEncryptionProtocol(user.FamilyID)
	now := nowString()
	if err := s.withTx(r.Context(), func(tx *sql.Tx) error {
		if _, err := s.txExec(tx, `
			INSERT INTO chats (id, family_id, type, title, created_by, media_visibility, comments_enabled, encryption_protocol, created_at, updated_at)
			VALUES (?, ?, 'channel', ?, ?, 'members', TRUE, ?, ?, ?)
		`, chatID, user.FamilyID, payload.Title, user.ID, encryptionProtocol, now, now); err != nil {
			return err
		}
		for _, memberID := range memberIDs {
			if _, err := s.txExec(tx, `INSERT INTO chat_members (chat_id, user_id, created_at) VALUES (?, ?, ?)`, chatID, memberID, now); err != nil {
				return err
			}
			if _, err := s.txExec(tx, `INSERT INTO chat_preferences (chat_id, user_id) VALUES (?, ?)`, chatID, memberID); err != nil {
				return err
			}
		}
		return nil
	}); err != nil {
		s.detail(w, http.StatusInternalServerError, "Could not create channel chat")
		return
	}

	chat, _ := s.buildChatPublic(chatID, user)
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
		if err := s.withTx(r.Context(), func(tx *sql.Tx) error {
			_, err := s.txExec(tx, `UPDATE chats SET title = ?, updated_at = ? WHERE id = ?`, title, nowString(), chatID)
			return err
		}); err != nil {
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
		if err := s.withTx(r.Context(), func(tx *sql.Tx) error {
			if chatPhotoFileID == "" {
				_, err := s.txExec(tx, `UPDATE chats SET chat_photo_file_id = NULL, updated_at = ? WHERE id = ?`, nowString(), chatID)
				return err
			}
			_, err := s.txExec(tx, `UPDATE chats SET chat_photo_file_id = ?, updated_at = ? WHERE id = ?`, chatPhotoFileID, nowString(), chatID)
			return err
		}); err != nil {
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
		if err := s.withTx(r.Context(), func(tx *sql.Tx) error {
			_, err := s.txExec(tx, `UPDATE chats SET comments_enabled = ?, updated_at = ? WHERE id = ?`, *payload.CommentsEnabled, nowString(), chatID)
			return err
		}); err != nil {
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
		if err := s.withTx(r.Context(), func(tx *sql.Tx) error {
			_, err := s.txExec(tx, `UPDATE chats SET pin_permission = ?, updated_at = ? WHERE id = ?`, perm, nowString(), chatID)
			return err
		}); err != nil {
			s.detail(w, http.StatusInternalServerError, "Could not update chat")
			return
		}
	}

	updated, _ := s.buildChatPublic(chatID, user)
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
	if err := s.withTx(r.Context(), func(tx *sql.Tx) error {
		if payload.IsMuted != nil {
			if _, err := s.txExec(tx, `UPDATE chat_preferences SET is_muted = ? WHERE chat_id = ? AND user_id = ?`, *payload.IsMuted, chatID, user.ID); err != nil {
				return err
			}
		}
		if payload.IsPinned != nil {
			if _, err := s.txExec(tx, `UPDATE chat_preferences SET is_pinned = ? WHERE chat_id = ? AND user_id = ?`, *payload.IsPinned, chatID, user.ID); err != nil {
				return err
			}
		}
		if payload.IsFavorite != nil {
			if _, err := s.txExec(tx, `UPDATE chat_preferences SET is_favorite = ? WHERE chat_id = ? AND user_id = ?`, *payload.IsFavorite, chatID, user.ID); err != nil {
				return err
			}
		}
		return nil
	}); err != nil {
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
	limit := 50
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
	messages, err := s.listMessages(chatID, user, before, limit, threadRootMessageID)
	if err != nil {
		s.detail(w, domainErrorStatus(err), "Could not load messages")
		return
	}
	s.json(w, http.StatusOK, messages)
}

func (s *Server) handleSendMessage(w http.ResponseWriter, r *http.Request, user userPublic) {
	chatID := chatIDFromURL(r)
	message, err := s.createMessage(r.Context(), user, chatID, nil, r)
	if err != nil {
		s.detail(w, domainErrorStatus(err), err.Error())
		return
	}
	s.json(w, http.StatusCreated, message)
}

func (s *Server) handleMarkMessageRead(w http.ResponseWriter, r *http.Request, user userPublic) {
	message, chatID, err := s.markMessageRead(r.Context(), user, messageIDFromURL(r))
	if err != nil {
		s.detail(w, domainErrorStatus(err), err.Error())
		return
	}
	s.emitMessageRead(chatID, message.ID, user.ID)
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
	var existingID string
	err = s.queryRow(`SELECT id FROM messages WHERE chat_id = ? AND forwarded_from_message_id = ? AND deleted_at IS NULL`, archive.ID, messageIDFromURL(r)).Scan(&existingID)
	if err == nil {
		message, buildErr := s.buildMessage(existingID, user.ID)
		if buildErr != nil {
			s.detail(w, http.StatusInternalServerError, "Could not save message")
			return
		}
		s.json(w, http.StatusOK, message)
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
	s.json(w, http.StatusOK, message)
}

func (s *Server) handleRemoveMessageReaction(w http.ResponseWriter, r *http.Request, user userPublic) {
	message, err := s.setMessageReaction(r.Context(), user, messageIDFromURL(r), chi.URLParam(r, "emoji"), false)
	if err != nil {
		s.detail(w, domainErrorStatus(err), err.Error())
		return
	}
	s.emitMessageUpdated(message.ChatID, message)
	s.json(w, http.StatusOK, message)
}

func (s *Server) canManageChat(chat chatPublic, user userPublic) bool {
	if chat.Type == "direct" {
		return false
	}
	if isAdmin(user.Role) {
		return true
	}
	return (chat.Type == "group" || chat.Type == "channel") && chat.CreatedBy != nil && *chat.CreatedBy == user.ID
}

func (s *Server) canSendToChat(chat chatPublic, user userPublic) bool {
	if chat.Type != "channel" {
		return true
	}
	return isAdmin(user.Role) || (chat.CreatedBy != nil && *chat.CreatedBy == user.ID)
}

func (s *Server) resolveChatMembers(user userPublic, rawMemberIDs []string) ([]string, error) {
	if len(rawMemberIDs) == 0 {
		return nil, errBadRequest
	}
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
	if len(memberIDs) == 1 {
		return nil, errBadRequest
	}
	return memberIDs, nil
}

func (s *Server) listChats(user userPublic) ([]chatPublic, error) {
	// The archive is a first-class personal chat: it exists as soon as the
	// user loads their chat list, rather than only after their first save.
	if _, err := s.ensureMessageArchive(user); err != nil {
		return nil, err
	}
	rows, err := s.query(`
		SELECT chat_id FROM chat_members WHERE user_id = ?
	`, user.ID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	chats := make([]chatPublic, 0)
	for rows.Next() {
		var chatID string
		if err := rows.Scan(&chatID); err != nil {
			return nil, err
		}
		chat, err := s.buildChatPublic(chatID, user)
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
	row := s.queryRow(`SELECT c.id FROM chats c JOIN chat_members cm ON cm.chat_id = c.id WHERE c.family_id = ? AND c.type = 'archive' AND cm.user_id = ?`, user.FamilyID, user.ID)
	var chatID string
	if err := row.Scan(&chatID); err == nil {
		return s.buildChatPublic(chatID, user)
	}
	chatID = uuid.NewString()
	now := nowString()
	if err := s.withTx(context.Background(), func(tx *sql.Tx) error {
		if _, err := s.txExec(tx, `INSERT INTO chats (id, family_id, type, title, created_by, media_visibility, encryption_protocol, created_at, updated_at) VALUES (?, ?, 'archive', 'Message Archive', ?, 'members', ?, ?, ?)`, chatID, user.FamilyID, user.ID, s.defaultMessageEncryptionProtocol(user.FamilyID), now, now); err != nil {
			return err
		}
		_, err := s.txExec(tx, `INSERT INTO chat_members (chat_id, user_id, created_at) VALUES (?, ?, ?)`, chatID, user.ID, now)
		return err
	}); err != nil {
		return chatPublic{}, err
	}
	return s.buildChatPublic(chatID, user)
}

func (s *Server) buildChatPublic(chatID string, user userPublic) (chatPublic, error) {
	row := s.queryRow(`
		SELECT c.id, c.family_id, c.type, c.title, c.created_by, c.chat_photo_file_id, c.media_visibility, c.comments_enabled, c.encryption_protocol, c.pin_permission, c.created_at, c.updated_at,
		       cp.is_muted, cp.is_pinned, cp.is_favorite
		FROM chats c
		JOIN chat_members cm ON cm.chat_id = c.id AND cm.user_id = ?
		LEFT JOIN chat_preferences cp ON cp.chat_id = c.id AND cp.user_id = ?
		WHERE c.id = ?
	`, user.ID, user.ID, chatID)

	var chat chatPublic
	var title, createdBy, chatPhotoFileID sql.NullString
	var createdAt, updatedAt string
	var commentsEnabled sql.NullBool
	var isMuted, isPinned, isFavorite sql.NullBool
	var pinPermission sql.NullString
	if err := row.Scan(
		&chat.ID,
		&chat.FamilyID,
		&chat.Type,
		&title,
		&createdBy,
		&chatPhotoFileID,
		&chat.MediaVisibility,
		&commentsEnabled,
		&chat.EncryptionProtocol,
		&pinPermission,
		&createdAt,
		&updatedAt,
		&isMuted,
		&isPinned,
		&isFavorite,
	); err != nil {
		return chatPublic{}, err
	}
	if chat.FamilyID != user.FamilyID {
		return chatPublic{}, errNotFound
	}
	chat.Title = stringPtrFromNull(title)
	chat.CreatedBy = stringPtrFromNull(createdBy)
	if chatPhotoFileID.Valid {
		if file, err := s.buildFilePublic(chatPhotoFileID.String, user.ID); err == nil && file.DeletedAt == nil {
			chat.ChatPhoto = &file
		}
	}
	chat.CreatedAt = parseTime(createdAt)
	chat.UpdatedAt = parseTime(updatedAt)
	chat.CommentsEnabled = true
	if commentsEnabled.Valid {
		chat.CommentsEnabled = commentsEnabled.Bool
	}
	chat.IsMuted = boolFromNull(isMuted)
	chat.IsPinned = boolFromNull(isPinned)
	chat.IsFavorite = boolFromNull(isFavorite)
	if pinPermission.Valid && pinPermission.String != "" {
		chat.PinPermission = pinPermission.String
	} else {
		chat.PinPermission = "everyone"
	}

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

	return chat, nil
}

func (s *Server) populateLastMessagePreview(chat *chatPublic) error {
	row := s.queryRow(`
		SELECT m.id, m.sender_id, u.display_name, m.type, m.content, m.created_at, COUNT(ma.file_id) AS attachment_count
		FROM messages m
		JOIN users u ON u.id = m.sender_id
		LEFT JOIN message_attachments ma ON ma.message_id = m.id
		WHERE m.chat_id = ? AND m.deleted_at IS NULL AND m.message_kind = 'chat'
		GROUP BY m.id, m.sender_id, u.display_name, m.type, m.content, m.created_at
		ORDER BY m.created_at DESC
		LIMIT 1
	`, chat.ID)
	var (
		id              string
		senderID        string
		senderName      sql.NullString
		messageType     string
		content         sql.NullString
		createdAt       string
		attachmentCount int
	)
	if err := row.Scan(&id, &senderID, &senderName, &messageType, &content, &createdAt, &attachmentCount); err != nil {
		if isMissing(err) {
			return nil
		}
		return err
	}
	chat.LastMessageID = &id
	chat.LastMessageSenderID = &senderID
	chat.LastMessageSenderDisplayName = stringPtrFromNull(senderName)
	chat.LastMessageType = &messageType
	preview := deriveMessagePreview(content, messageType, attachmentCount)
	chat.LastMessageContent = &preview
	timestamp := parseTime(createdAt)
	chat.LastMessageCreatedAt = &timestamp
	return nil
}

func deriveMessagePreview(content sql.NullString, messageType string, attachmentCount int) string {
	trimmed := strings.TrimSpace(content.String)
	if content.Valid && trimmed != "" {
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
	rows, err := s.query(`
		SELECT u.id, u.display_name, u.username, u.role, u.public_key, u.profile_photo_file_id
		FROM chat_members cm
		JOIN users u ON u.id = cm.user_id
		WHERE cm.chat_id = ? AND u.is_active = 1
		ORDER BY u.display_name ASC
	`, chatID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	members := make([]chatMemberPublic, 0)
	for rows.Next() {
		var member chatMemberPublic
		var publicKey, profilePhotoFileID sql.NullString
		if err := rows.Scan(&member.ID, &member.DisplayName, &member.Username, &member.Role, &publicKey, &profilePhotoFileID); err != nil {
			return nil, err
		}
		member.PublicKey = stringPtrFromNull(publicKey)
		if profilePhotoFileID.Valid {
			if file, err := s.buildFilePublic(profilePhotoFileID.String, member.ID); err == nil && file.DeletedAt == nil {
				member.ProfilePhoto = &file
			}
		}
		members = append(members, member)
	}
	return members, nil
}

func (s *Server) unreadCount(chatID, userID string) (int, error) {
	row := s.queryRow(`
		SELECT COUNT(*)
		FROM messages m
		LEFT JOIN chat_preferences cp ON cp.chat_id = m.chat_id AND cp.user_id = ?
		WHERE m.chat_id = ?
		  AND m.sender_id <> ?
		  AND m.deleted_at IS NULL
		  AND (cp.last_read_at IS NULL OR m.created_at > cp.last_read_at)
	`, userID, chatID, userID)
	var count int
	return count, row.Scan(&count)
}

func (s *Server) directApprovalStatus(chatID, userID string) (int, bool, error) {
	rows, err := s.query(`SELECT user_id FROM chat_media_approvals WHERE chat_id = ?`, chatID)
	if err != nil {
		return 0, false, err
	}
	defer rows.Close()
	count := 0
	approved := false
	for rows.Next() {
		var actorID string
		if err := rows.Scan(&actorID); err != nil {
			return 0, false, err
		}
		count++
		if actorID == userID {
			approved = true
		}
	}
	return count, approved, nil
}

func (s *Server) findDirectChat(userA, userB string) (string, error) {
	rows, err := s.query(`
		SELECT c.id
		FROM chats c
		WHERE c.type = 'direct'
	`)
	if err != nil {
		return "", err
	}
	defer rows.Close()

	target := []string{userA, userB}
	slices.Sort(target)
	for rows.Next() {
		var chatID string
		if err := rows.Scan(&chatID); err != nil {
			return "", err
		}
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
		return s.withTx(ctx, func(tx *sql.Tx) error {
			if _, err := s.txExec(tx, `UPDATE chats SET media_visibility = ?, updated_at = ? WHERE id = ?`, desired, nowString(), chatID); err != nil {
				return err
			}
			_, err := s.txExec(tx, `DELETE FROM chat_media_approvals WHERE chat_id = ?`, chatID)
			return err
		})
	case "direct":
		if desired == "members" {
			return s.withTx(ctx, func(tx *sql.Tx) error {
				if _, err := s.txExec(tx, `UPDATE chats SET media_visibility = 'members', updated_at = ? WHERE id = ?`, nowString(), chatID); err != nil {
					return err
				}
				_, err := s.txExec(tx, `DELETE FROM chat_media_approvals WHERE chat_id = ?`, chatID)
				return err
			})
		}
		return s.withTx(ctx, func(tx *sql.Tx) error {
			if _, err := s.txExec(tx, `
				INSERT INTO chat_media_approvals (chat_id, user_id, created_at)
				VALUES (?, ?, ?)
				ON CONFLICT (chat_id, user_id) DO NOTHING
			`, chatID, user.ID, nowString()); err != nil {
				return err
			}
			var approvalCount int
			if err := s.txQueryRow(tx, `SELECT COUNT(*) FROM chat_media_approvals WHERE chat_id = ?`, chatID).Scan(&approvalCount); err != nil {
				return err
			}
			if approvalCount >= 2 {
				if _, err := s.txExec(tx, `UPDATE chats SET media_visibility = 'family', updated_at = ? WHERE id = ?`, nowString(), chatID); err != nil {
					return err
				}
			} else {
				if _, err := s.txExec(tx, `UPDATE chats SET media_visibility = 'members', updated_at = ? WHERE id = ?`, nowString(), chatID); err != nil {
					return err
				}
			}
			return nil
		})
	default:
		return errBadRequest
	}
}

func (s *Server) listMessages(chatID string, user userPublic, before string, limit int, threadRootMessageID string) ([]messagePublic, error) {
	baseQuery := `
		SELECT id
		FROM messages
		WHERE chat_id = ? AND deleted_at IS NULL
		AND id NOT IN (SELECT message_id FROM message_user_deletions WHERE user_id = ?)
	`
	args := []any{chatID, user.ID}
	if threadRootMessageID != "" {
		if err := s.validateReplyTarget(chatID, threadRootMessageID); err != nil {
			return nil, err
		}
		baseQuery += " AND (id = ? OR thread_root_message_id = ?)"
		args = append(args, threadRootMessageID, threadRootMessageID)
	} else {
		baseQuery += " AND message_kind = 'chat'"
	}
	if before != "" {
		row := s.queryRow(`SELECT created_at FROM messages WHERE id = ? AND chat_id = ?`, before, chatID)
		var createdAt string
		if err := row.Scan(&createdAt); err != nil {
			return nil, errBadRequest
		}
		baseQuery += " AND created_at < ?"
		args = append(args, createdAt)
	}
	baseQuery += " ORDER BY created_at DESC LIMIT ?"
	args = append(args, limit)

	rows, err := s.query(baseQuery, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	ids := make([]string, 0)
	for rows.Next() {
		var messageID string
		if err := rows.Scan(&messageID); err != nil {
			return nil, err
		}
		ids = append(ids, messageID)
	}
	slices.Reverse(ids)
	messages := make([]messagePublic, 0, len(ids))
	for _, messageID := range ids {
		message, err := s.buildMessage(messageID, user.ID)
		if err != nil {
			return nil, err
		}
		messages = append(messages, message)
	}
	return messages, nil
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
	row := s.queryRow(`
		SELECT m.id, m.chat_id, c.family_id, m.sender_id, u.display_name, m.type, m.content,
		       m.encryption_protocol, m.ciphertext, m.nonce, m.key_version, m.encryption_metadata,
		       m.reply_to_message_id, m.thread_root_message_id, m.message_kind, m.forwarded_from_message_id, m.forwarded_from_chat_id,
		       m.created_at, m.updated_at, m.deleted_at, m.is_edited
		FROM messages m
		JOIN chats c ON c.id = m.chat_id
		JOIN users u ON u.id = m.sender_id
		WHERE m.id = ?
	`, messageID)
	var message messagePublic
	var senderName sql.NullString
	var familyID string
	var content, encryptionProtocol, ciphertext, nonce, metadata, replyTo, threadRootMessageID, messageKind, forwardedFromMessageID, forwardedFromChatID, deletedAt sql.NullString
	var keyVersion sql.NullInt64
	var createdAt, updatedAt string
	var isEdited bool
	if err := row.Scan(
		&message.ID,
		&message.ChatID,
		&familyID,
		&message.SenderID,
		&senderName,
		&message.Type,
		&content,
		&encryptionProtocol,
		&ciphertext,
		&nonce,
		&keyVersion,
		&metadata,
		&replyTo,
		&threadRootMessageID,
		&messageKind,
		&forwardedFromMessageID,
		&forwardedFromChatID,
		&createdAt,
		&updatedAt,
		&deletedAt,
		&isEdited,
	); err != nil {
		return messagePublic{}, err
	}
	message.SenderDisplayName = stringPtrFromNull(senderName)
	message.Content = stringPtrFromNull(content)
	message.EncryptionProtocol = encryptionProtocolLegacyPlain
	if encryptionProtocol.Valid && encryptionProtocol.String != "" {
		message.EncryptionProtocol = encryptionProtocol.String
	}
	message.Ciphertext = stringPtrFromNull(ciphertext)
	message.Nonce = stringPtrFromNull(nonce)
	message.EncryptionMetadata = stringPtrFromNull(metadata)
	if message.Type == "call" && metadata.Valid {
		var call callHistoryPublic
		if err := json.Unmarshal([]byte(metadata.String), &call); err == nil {
			message.Call = &call
		}
	}
	if keyVersion.Valid {
		value := int(keyVersion.Int64)
		message.KeyVersion = &value
	}
	if message.EncryptionProtocol == encryptionProtocolServerAtRest && message.Ciphertext != nil && message.Nonce != nil {
		decrypted, err := s.decryptServerAtRest(familyID, *message.Ciphertext, *message.Nonce)
		if err == nil {
			message.Content = decrypted
		}
		message.Ciphertext = nil
		message.Nonce = nil
		message.EncryptionMetadata = nil
	}
	message.ReplyToMessageID = stringPtrFromNull(replyTo)
	message.ThreadRootMessageID = stringPtrFromNull(threadRootMessageID)
	message.MessageKind = "chat"
	if messageKind.Valid && strings.TrimSpace(messageKind.String) != "" {
		message.MessageKind = messageKind.String
	}
	message.CreatedAt = parseTime(createdAt)
	message.UpdatedAt = parseTime(updatedAt)
	if forwardedFromMessageID.Valid && forwardedFromChatID.Valid {
		message.ForwardedFrom = &messageForwardPublic{
			MessageID: forwardedFromMessageID.String,
			ChatID:    forwardedFromChatID.String,
		}
		forwardedRow := s.queryRow(`
			SELECT m.sender_id, u.display_name
			FROM messages m
			JOIN users u ON u.id = m.sender_id
			WHERE m.id = ?
		`, forwardedFromMessageID.String)
		var forwardedSenderID string
		var forwardedSenderName sql.NullString
		if err := forwardedRow.Scan(&forwardedSenderID, &forwardedSenderName); err == nil {
			message.ForwardedFrom.SenderID = forwardedSenderID
			message.ForwardedFrom.SenderDisplayName = stringPtrFromNull(forwardedSenderName)
		}
	}
	if deletedAt.Valid {
		deleted := parseTime(deletedAt.String)
		message.DeletedAt = &deleted
	}
	message.IsEdited = isEdited

	statusRows, err := s.query(`
		SELECT user_id, status, created_at
		FROM message_statuses
		WHERE message_id = ?
		ORDER BY created_at ASC
	`, messageID)
	if err != nil {
		return messagePublic{}, err
	}
	defer statusRows.Close()
	message.Statuses = make([]messageStatusPublic, 0)
	for statusRows.Next() {
		var status messageStatusPublic
		var created string
		if err := statusRows.Scan(&status.UserID, &status.Status, &created); err != nil {
			return messagePublic{}, err
		}
		status.CreatedAt = parseTime(created)
		message.Statuses = append(message.Statuses, status)
	}

	reactionRows, err := s.query(`
		SELECT emoji, user_id
		FROM message_reactions
		WHERE message_id = ?
		ORDER BY emoji ASC, created_at ASC
	`, messageID)
	if err != nil {
		return messagePublic{}, err
	}
	defer reactionRows.Close()
	message.Reactions = make([]messageReactionPublic, 0)
	reactionIndex := make(map[string]int)
	for reactionRows.Next() {
		var emoji string
		var userID string
		if err := reactionRows.Scan(&emoji, &userID); err != nil {
			return messagePublic{}, err
		}
		index, ok := reactionIndex[emoji]
		if !ok {
			reactionIndex[emoji] = len(message.Reactions)
			message.Reactions = append(message.Reactions, messageReactionPublic{
				Emoji:   emoji,
				UserIDs: make([]string, 0, 1),
			})
			index = len(message.Reactions) - 1
		}
		message.Reactions[index].Count++
		message.Reactions[index].UserIDs = append(message.Reactions[index].UserIDs, userID)
		if userID == viewerID {
			message.Reactions[index].Reacted = true
		}
	}

	attachmentRows, err := s.query(`
		SELECT file_id FROM message_attachments WHERE message_id = ?
	`, messageID)
	if err != nil {
		return messagePublic{}, err
	}
	defer attachmentRows.Close()
	message.Attachments = make([]filePublic, 0)
	for attachmentRows.Next() {
		var fileID string
		if err := attachmentRows.Scan(&fileID); err != nil {
			return messagePublic{}, err
		}
		file, err := s.buildFilePublic(fileID, viewerID)
		if err == nil {
			message.Attachments = append(message.Attachments, file)
		}
	}
	return message, nil
}

func (s *Server) loadAttachmentsForMessage(fileIDs []string, user userPublic, chatID string) ([]filePublic, error) {
	files := make([]filePublic, 0, len(fileIDs))
	for _, fileID := range fileIDs {
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

func (s *Server) markMessageRead(ctx context.Context, user userPublic, messageID string) (messagePublic, string, error) {
	row := s.queryRow(`
		SELECT id, chat_id, sender_id, created_at
		FROM messages
		WHERE id = ? AND deleted_at IS NULL
	`, messageID)
	var id, chatID, senderID, createdAt string
	if err := row.Scan(&id, &chatID, &senderID, &createdAt); err != nil {
		return messagePublic{}, "", errNotFound
	}
	if _, err := s.buildChatPublic(chatID, user); err != nil {
		return messagePublic{}, "", errNotFound
	}

	err := s.withTx(ctx, func(tx *sql.Tx) error {
		if _, err := s.txExec(tx, `
			UPDATE chat_preferences
			SET last_read_message_id = ?, last_read_at = ?
			WHERE chat_id = ? AND user_id = ? AND (last_read_at IS NULL OR last_read_at < ?)
		`, id, createdAt, chatID, user.ID, createdAt); err != nil {
			return err
		}
		if senderID == user.ID {
			return nil
		}
		rows, err := s.txQuery(tx, `
			SELECT id FROM messages
			WHERE chat_id = ? AND deleted_at IS NULL AND created_at <= ? AND sender_id <> ?
		`, chatID, createdAt, user.ID)
		if err != nil {
			return err
		}
		defer rows.Close()
		messageIDs := make([]string, 0)
		for rows.Next() {
			var itemID string
			if err := rows.Scan(&itemID); err != nil {
				return err
			}
			messageIDs = append(messageIDs, itemID)
		}
		for _, itemID := range messageIDs {
			if _, err := s.txExec(tx, `
				INSERT INTO message_statuses (message_id, user_id, status, created_at)
				VALUES (?, ?, 'read', ?)
				ON CONFLICT (message_id, user_id, status) DO NOTHING
			`, itemID, user.ID, nowString()); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return messagePublic{}, "", err
	}

	message, err := s.buildMessage(messageID, user.ID)
	if err != nil {
		return messagePublic{}, "", err
	}
	return message, chatID, nil
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
		ID              string
		ObjectKey       string
		StorageProvider string
		OriginalName    string
		MimeType        string
		SizeBytes       int64
		Checksum        *string
	}

	now := nowString()
	clones := make([]clonedFile, 0, len(sourceMessage.Attachments))
	for _, attachment := range sourceMessage.Attachments {
		file, sourceObjectKey, err := s.loadFileRecord(attachment.ID, user.ID)
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
				_ = s.storage.Delete(clone.ObjectKey)
			}
			return nil, func() {}, err
		}
		clones = append(clones, clonedFile{
			ID:              uuid.NewString(),
			ObjectKey:       objectKey,
			StorageProvider: file.StorageProvider,
			OriginalName:    file.OriginalName,
			MimeType:        file.MimeType,
			SizeBytes:       int64(len(data)),
			Checksum:        file.Checksum,
		})
	}

	if err := s.withTx(ctx, func(tx *sql.Tx) error {
		for _, clone := range clones {
			if _, err := s.txExec(tx, `
				INSERT INTO files (
					id, family_id, uploaded_by, chat_id, access_scope, storage_provider,
					object_key, original_name, mime_type, size_bytes, checksum, created_at
				)
				VALUES (?, ?, ?, ?, 'chat', ?, ?, ?, ?, ?, ?, ?)
			`, clone.ID, targetChat.FamilyID, user.ID, targetChat.ID, clone.StorageProvider, clone.ObjectKey, clone.OriginalName, clone.MimeType, clone.SizeBytes, clone.Checksum, now); err != nil {
				return err
			}
		}
		return nil
	}); err != nil {
		for _, clone := range clones {
			_ = s.storage.Delete(clone.ObjectKey)
		}
		return nil, func() {}, err
	}

	fileIDs := make([]string, 0, len(clones))
	for _, clone := range clones {
		fileIDs = append(fileIDs, clone.ID)
	}
	cleanup := func() {
		for _, clone := range clones {
			_, _ = s.exec(`DELETE FROM files WHERE id = ?`, clone.ID)
			_ = s.storage.Delete(clone.ObjectKey)
		}
	}
	return fileIDs, cleanup, nil
}

func (s *Server) setMessageReaction(ctx context.Context, user userPublic, messageID, emoji string, add bool) (messagePublic, error) {
	emoji = strings.TrimSpace(emoji)
	if emoji == "" || len([]rune(emoji)) > 32 {
		return messagePublic{}, newStatusError(http.StatusUnprocessableEntity, "emoji is required")
	}

	row := s.queryRow(`
		SELECT chat_id
		FROM messages
		WHERE id = ? AND deleted_at IS NULL
	`, messageID)
	var chatID string
	if err := row.Scan(&chatID); err != nil {
		return messagePublic{}, errNotFound
	}
	if _, err := s.buildChatPublic(chatID, user); err != nil {
		return messagePublic{}, errNotFound
	}

	if err := s.withTx(ctx, func(tx *sql.Tx) error {
		if add {
			if _, err := s.txExec(tx, `
				DELETE FROM message_reactions
				WHERE message_id = ? AND user_id = ? AND emoji <> ?
			`, messageID, user.ID, emoji); err != nil {
				return err
			}
			_, err := s.txExec(tx, `
				INSERT INTO message_reactions (message_id, user_id, emoji, created_at)
				VALUES (?, ?, ?, ?)
				ON CONFLICT (message_id, user_id, emoji) DO NOTHING
			`, messageID, user.ID, emoji, nowString())
			return err
		}
		_, err := s.txExec(tx, `
			DELETE FROM message_reactions
			WHERE message_id = ? AND user_id = ? AND emoji = ?
		`, messageID, user.ID, emoji)
		return err
	}); err != nil {
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

	row := s.queryRow(`SELECT sender_id, chat_id FROM messages WHERE id = ? AND deleted_at IS NULL`, messageID)
	var senderID, chatID string
	if err := row.Scan(&senderID, &chatID); err != nil {
		s.detail(w, http.StatusNotFound, "Message not found")
		return
	}
	if senderID != user.ID {
		s.detail(w, http.StatusForbidden, "You can only edit your own messages")
		return
	}

	chat, err := s.buildChatPublic(chatID, user)
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
		keyVersion := 1
		metadata := messageEncryptionMetadataServer
		if _, err := s.exec(`
			UPDATE messages
			SET ciphertext = ?, nonce = ?, key_version = ?, encryption_metadata = ?, content = NULL,
			    is_edited = TRUE, updated_at = ?
			WHERE id = ?
		`, ciphertext, nonce, keyVersion, metadata, now, messageID); err != nil {
			s.detail(w, http.StatusInternalServerError, "Failed to update message")
			return
		}
	} else {
		if _, err := s.exec(`
			UPDATE messages
			SET content = ?, is_edited = TRUE, updated_at = ?
			WHERE id = ?
		`, content, now, messageID); err != nil {
			s.detail(w, http.StatusInternalServerError, "Failed to update message")
			return
		}
	}

	message, err := s.buildMessage(messageID, user.ID)
	if err != nil {
		s.detail(w, http.StatusInternalServerError, "Failed to load updated message")
		return
	}
	s.emitMessageUpdated(chatID, message)
	s.json(w, http.StatusOK, message)
}

func (s *Server) handleDeleteMessage(w http.ResponseWriter, r *http.Request, user userPublic) {
	messageID := messageIDFromURL(r)
	scope := r.URL.Query().Get("scope")

	row := s.queryRow(`SELECT sender_id, chat_id FROM messages WHERE id = ? AND deleted_at IS NULL`, messageID)
	var senderID, chatID string
	if err := row.Scan(&senderID, &chatID); err != nil {
		s.detail(w, http.StatusNotFound, "Message not found")
		return
	}
	if senderID != user.ID {
		s.detail(w, http.StatusForbidden, "You can only delete your own messages")
		return
	}

	if scope == "me" {
		if _, err := s.exec(`
			INSERT INTO message_user_deletions (message_id, user_id, deleted_at)
			VALUES (?, ?, ?)
			ON CONFLICT (message_id, user_id) DO NOTHING
		`, messageID, user.ID, nowString()); err != nil {
			s.detail(w, http.StatusInternalServerError, "Failed to delete message")
			return
		}
	} else {
		if _, err := s.exec(`
			UPDATE messages SET deleted_at = ? WHERE id = ?
		`, nowString(), messageID); err != nil {
			s.detail(w, http.StatusInternalServerError, "Failed to delete message")
			return
		}
		s.emitMessageDeleted(chatID, messageID)
	}

	s.json(w, http.StatusOK, map[string]string{"messageId": messageID, "chatId": chatID})
}
