package app

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"path"
	"regexp"
	"slices"
	"strings"
	"time"

	"stovo-messenger/backend/internal/cache"
	"stovo-messenger/backend/internal/domain"
	featurechats "stovo-messenger/backend/internal/features/chats"
	featurefiles "stovo-messenger/backend/internal/features/files"
	featuremessages "stovo-messenger/backend/internal/features/messages"
	httptransport "stovo-messenger/backend/internal/transport/http"
	realtimetransport "stovo-messenger/backend/internal/transport/realtime"

	"github.com/google/uuid"
)

type messageForwardSource struct {
	MessageID string
	ChatID    string
}

// createChat is the application/use-case adapter behind the HTTP transport's
// ChatMutationHandler. It has no HTTP request or response dependency.
func (s *Server) createChat(ctx context.Context, user userPublic, kind string, request httptransport.ChatCreateRequest) (any, int, error) {
	if kind == "direct" {
		target, err := s.getUserByID(request.UserID)
		if err != nil || target.FamilyID != user.FamilyID || !target.IsActive {
			return nil, 0, newStatusError(http.StatusBadRequest, "Invalid direct chat target")
		}
		if target.ID == user.ID {
			return nil, 0, newStatusError(http.StatusBadRequest, "You cannot start a direct chat with yourself")
		}
		blocked, err := s.directContactBlocked(user.ID, target.ID)
		if err != nil {
			return nil, 0, newStatusError(http.StatusInternalServerError, "Could not check privacy settings")
		}
		if blocked {
			return nil, 0, newStatusError(http.StatusForbidden, "Direct messages are unavailable for this member")
		}
		if !contactPermissionAllows(target, user.ID, "direct") {
			return nil, 0, newStatusError(http.StatusForbidden, "Direct messages are restricted by this member")
		}
		if existingID, err := s.findDirectChat(user.ID, target.ID); err == nil {
			chat, buildErr := s.buildChatPublic(existingID, user)
			if buildErr != nil {
				return nil, 0, newStatusError(http.StatusInternalServerError, "Could not load created chat")
			}
			return chat, http.StatusCreated, nil
		}
		chatID := uuid.NewString()
		if err := s.chatCreation.Create(ctx, featurechats.CreateChat{ID: chatID, FamilyID: user.FamilyID, Type: "direct", CreatedBy: user.ID, MediaVisibility: "members", EncryptionProtocol: s.defaultMessageEncryptionProtocol(user.FamilyID), CreatedAt: nowString(), MemberIDs: []string{user.ID, target.ID}, CreatePreferences: true}); err != nil {
			return nil, 0, newStatusError(http.StatusInternalServerError, "Could not create direct chat")
		}
		chat, err := s.buildChatPublic(chatID, user)
		if err != nil {
			return nil, 0, newStatusError(http.StatusInternalServerError, "Could not load created chat")
		}
		return chat, http.StatusCreated, nil
	}
	if (kind == "channel" || kind == "voice") && !hasPermission(user, permissionManageChannels) {
		return nil, 0, newStatusError(http.StatusForbidden, "Permission denied")
	}
	if request.Title == "" {
		return nil, 0, newStatusError(http.StatusUnprocessableEntity, "Invalid "+kind+" chat payload")
	}
	members, err := s.resolveChatMembers(user, request.MemberIDs)
	if err != nil {
		return nil, 0, newStatusError(domainErrorStatus(err), "Invalid "+kind+" chat members")
	}
	if err := s.validateInvitePermissions(user, members, kind); err != nil {
		return nil, 0, newStatusError(http.StatusForbidden, err.Error())
	}
	chatID, title := uuid.NewString(), request.Title
	create := featurechats.CreateChat{ID: chatID, FamilyID: user.FamilyID, Type: kind, Title: &title, CreatedBy: user.ID, EncryptionProtocol: s.defaultMessageEncryptionProtocol(user.FamilyID), CreatedAt: nowString(), MemberIDs: members, CreatePreferences: true}
	if kind == "group" {
		create.MediaVisibility = "family"
	} else {
		create.MediaVisibility = "members"
		comments := true
		create.CommentsEnabled = &comments
	}
	if err := s.chatCreation.Create(ctx, create); err != nil {
		return nil, 0, newStatusError(http.StatusInternalServerError, "Could not create "+kind+" chat")
	}
	chat, err := s.buildChatPublic(chatID, user)
	if err != nil {
		return nil, 0, newStatusError(http.StatusInternalServerError, "Could not load created chat")
	}
	return chat, http.StatusCreated, nil
}

// addChatMembers is an HTTP-free application operation used by the transport
// adapter. It preserves the legacy authorization and response contract.
func (s *Server) addChatMembers(ctx context.Context, user userPublic, chatID string, userIDs []string) (any, int, error) {
	chat, err := s.buildChatPublic(chatID, user)
	if err != nil {
		return nil, 0, newStatusError(http.StatusNotFound, "Chat not found")
	}
	if chat.Type != "group" && chat.Type != "channel" && chat.Type != "voice" {
		return nil, 0, newStatusError(http.StatusUnprocessableEntity, "People can only be added to group, channel, or voice chats")
	}
	if !hasPermission(user, permissionManageMembers) && !s.canManageChat(chat, user) {
		return nil, 0, newStatusError(http.StatusForbidden, "Permission denied")
	}
	members, err := s.resolveChatMembers(user, userIDs)
	if err != nil {
		return nil, 0, newStatusError(domainErrorStatus(err), "Invalid chat members")
	}
	if err := s.validateInvitePermissions(user, members, chat.Type); err != nil {
		return nil, 0, newStatusError(http.StatusForbidden, err.Error())
	}
	if err := s.chatCreation.AddMembers(ctx, featurechats.AddMembers{ChatID: chatID, UserIDs: members, CreatedAt: nowString()}); err != nil {
		return nil, 0, newStatusError(http.StatusInternalServerError, "Could not add people to chat")
	}
	updated, err := s.buildChatPublic(chatID, user)
	if err != nil {
		return nil, 0, newStatusError(http.StatusInternalServerError, "Could not load updated chat")
	}
	return updated, http.StatusOK, nil
}

func (s *Server) updateChatPreferences(ctx context.Context, user userPublic, chatID string, payload httptransport.ChatPreferencesRequest) (any, int, error) {
	if _, err := s.buildChatPublic(chatID, user); err != nil {
		return nil, 0, newStatusError(http.StatusNotFound, "Chat not found")
	}
	if payload.WallpaperFileID != nil {
		wallpaper := strings.TrimSpace(*payload.WallpaperFileID)
		if wallpaper != "" {
			if err := s.validateImageFileForFamily(wallpaper, user, "Wallpaper not found"); err != nil {
				return nil, 0, newStatusError(domainErrorStatus(err), err.Error())
			}
		}
	}
	prefs := featurechats.Preferences{ChatID: chatID, UserID: user.ID, IsMuted: payload.IsMuted, IsPinned: payload.IsPinned, IsFavorite: payload.IsFavorite}
	if payload.WallpaperFileID != nil {
		wallpaper := strings.TrimSpace(*payload.WallpaperFileID)
		if wallpaper == "" {
			prefs.ClearWallpaper = true
		} else {
			prefs.WallpaperFileID = &wallpaper
		}
	}
	if err := s.chatSettings.UpdatePreferences(ctx, prefs); err != nil {
		return nil, 0, newStatusError(http.StatusInternalServerError, "Could not update chat preferences")
	}
	updated, err := s.buildChatPublic(chatID, user)
	if err != nil {
		return nil, 0, newStatusError(http.StatusInternalServerError, "Could not load updated chat")
	}
	return updated, http.StatusOK, nil
}

func (s *Server) updateChat(ctx context.Context, user userPublic, chatID string, payload httptransport.ChatUpdateRequest) (any, int, error) {
	chat, err := s.buildChatPublic(chatID, user)
	if err != nil {
		return nil, 0, newStatusError(http.StatusNotFound, "Chat not found")
	}
	if payload.Title != nil {
		if *payload.Title == "" {
			return nil, 0, newStatusError(http.StatusUnprocessableEntity, "title cannot be blank")
		}
		if !s.canManageChat(chat, user) {
			return nil, 0, newStatusError(http.StatusForbidden, "Permission denied")
		}
		if err := s.chatSettings.SetTitle(ctx, chatID, *payload.Title); err != nil {
			return nil, 0, newStatusError(http.StatusInternalServerError, "Could not update chat")
		}
	}
	if payload.MediaVisibility != nil {
		if err := s.updateChatMediaVisibility(ctx, chatID, *payload.MediaVisibility, chat, user); err != nil {
			return nil, 0, newStatusError(domainErrorStatus(err), err.Error())
		}
	}
	if payload.ChatPhotoFileID != nil {
		photo := strings.TrimSpace(*payload.ChatPhotoFileID)
		if !s.canManageChat(chat, user) {
			return nil, 0, newStatusError(http.StatusForbidden, "Permission denied")
		}
		if photo != "" {
			if err := s.validateImageFileForFamily(photo, user, "Chat photo not found"); err != nil {
				return nil, 0, newStatusError(domainErrorStatus(err), err.Error())
			}
		}
		var photoPtr *string
		if photo != "" {
			photoPtr = &photo
		}
		if err := s.chatSettings.SetPhoto(ctx, chatID, photoPtr); err != nil {
			return nil, 0, newStatusError(http.StatusInternalServerError, "Could not update chat")
		}
	}
	if payload.CommentsEnabled != nil {
		if errors.Is(featurechats.ValidateCommentsChatType(chat.Type), featurechats.ErrCommentsUnavailable) {
			return nil, 0, newStatusError(http.StatusUnprocessableEntity, "comments can only be changed for channels")
		}
		if !s.canManageChat(chat, user) {
			return nil, 0, newStatusError(http.StatusForbidden, "Permission denied")
		}
		if err := s.chatSettings.SetCommentsEnabled(ctx, chatID, chat.Type, *payload.CommentsEnabled); err != nil {
			return nil, 0, newStatusError(http.StatusInternalServerError, "Could not update chat")
		}
	}
	if payload.PinPermission != nil {
		if !s.canManageChat(chat, user) {
			return nil, 0, newStatusError(http.StatusForbidden, "Permission denied")
		}
		if err := s.chatSettings.SetPinPermission(ctx, chatID, *payload.PinPermission); errors.Is(err, featurechats.ErrInvalidPinPermission) {
			return nil, 0, newStatusError(http.StatusUnprocessableEntity, "pinPermission must be 'everyone' or 'admins_only'")
		} else if err != nil {
			return nil, 0, newStatusError(http.StatusInternalServerError, "Could not update chat")
		}
	}
	if payload.MessageDelaySeconds != nil {
		if !s.canManageChat(chat, user) {
			return nil, 0, newStatusError(http.StatusForbidden, "Permission denied")
		}
		delay, err := s.chatSettings.SetMessageDelay(ctx, chatID, *payload.MessageDelaySeconds)
		if errors.Is(err, featurechats.ErrInvalidMessageDelay) {
			return nil, 0, newStatusError(http.StatusUnprocessableEntity, "messageDelaySeconds must be between 0 and 86400")
		}
		if err != nil {
			return nil, 0, newStatusError(http.StatusInternalServerError, "Could not update chat")
		}
		chat.MessageDelaySeconds, chat.UpdatedAt = delay.Seconds, parseTime(delay.UpdatedAt)
		return chat, http.StatusOK, nil
	}
	updated, err := s.buildChatPublic(chatID, user)
	if err != nil {
		return nil, 0, newStatusError(http.StatusInternalServerError, "Could not load updated chat")
	}
	return updated, http.StatusOK, nil
}

// messageHistoryPage is the application pagination/cache operation. HTTP
// query validation is owned by transport/http.
func (s *Server) messageHistoryPage(ctx context.Context, user userPublic, chatID, before string, limit int, threadRootMessageID string) (messageHistoryPage, error) {
	if _, err := s.buildChatPublic(chatID, user); err != nil {
		return messageHistoryPage{}, errNotFound
	}
	var cacheRevision historyCacheRevision
	if before == "" && threadRootMessageID == "" && limit == 20 {
		cacheRevision = s.chatHistoryRevisions(ctx, chatID, user.ID)
		if cached, ok := s.loadCachedLatestHistory(ctx, chatID, user.ID, cacheRevision); ok {
			return cached, nil
		}
	}
	messages, hasMore, err := s.listMessagesPage(chatID, user, before, limit, threadRootMessageID)
	if err != nil {
		return messageHistoryPage{}, err
	}
	page := newMessageHistoryPage(messages, hasMore)
	if before == "" && threadRootMessageID == "" && limit == 20 {
		s.cacheLatestHistory(ctx, chatID, user.ID, cacheRevision, page)
	}
	return page, nil
}

func (s *Server) sendRESTMessage(ctx context.Context, user userPublic, chatID string, request httptransport.MessageSendRequest, operationID string) (messagePublic, error) {
	payload := sendMessageRequest{Type: request.Type, Content: request.Content, FileIDs: request.FileIDs, ReplyToMessageID: request.ReplyToMessageID, ThreadRootMessageID: request.ThreadRootMessageID, EncryptionProtocol: request.EncryptionProtocol, Ciphertext: request.Ciphertext, Nonce: request.Nonce, KeyVersion: request.KeyVersion, EncryptionMetadata: request.EncryptionMetadata, MentionedUserIDs: request.MentionedUserIDs, AttachmentsPending: request.AttachmentsPending}
	message, replayed, err := s.createRESTMessageWithSync(ctx, user, chatID, payload, operationID)
	if err != nil {
		return messagePublic{}, err
	}
	if !replayed {
		if chat, chatErr := s.buildChatPublic(chatID, user); chatErr == nil {
			s.notifyCreatedRESTMessage(chat, user, message, payload)
		}
		s.bumpChatHistoryRevision(ctx, chatID)
	}
	return message, nil
}

// archiveMessage contains the archive use-case orchestration; the HTTP
// transport owns its endpoint parsing and JSON/status serialization.
func (s *Server) archiveMessage(ctx context.Context, user userPublic, messageID string) (messagePublic, int, error) {
	archive, err := s.ensureMessageArchive(user)
	if err != nil {
		return messagePublic{}, http.StatusInternalServerError, newStatusError(http.StatusInternalServerError, "Could not load Message Archive")
	}
	existingID, err := s.messageForwards.Existing(ctx, archive.ID, messageID)
	if err == nil {
		message, buildErr := s.buildMessage(existingID, user.ID)
		if buildErr != nil {
			return messagePublic{}, http.StatusInternalServerError, newStatusError(http.StatusInternalServerError, "Could not save message")
		}
		return message, http.StatusOK, nil
	}
	if !isMissing(err) {
		return messagePublic{}, http.StatusInternalServerError, newStatusError(http.StatusInternalServerError, "Could not save message")
	}
	message, err := s.forwardMessage(ctx, user, messageID, archive.ID)
	if err != nil {
		return messagePublic{}, domainErrorStatus(err), err
	}
	return message, http.StatusCreated, nil
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
	rows, err := s.chatQueries.ListForUser(context.Background(), user.ID)
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
	chatID, err := s.chatArchive.Existing(context.Background(), user.FamilyID, user.ID)
	if err == nil {
		return s.buildChatPublic(chatID, user)
	}
	if !isMissing(err) {
		return chatPublic{}, err
	}
	chatID = uuid.NewString()
	now := nowString()
	title := "Message Archive"
	if err := s.chatCreation.Create(context.Background(), featurechats.CreateChat{
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
	row, err := s.chatQueries.GetForMember(context.Background(), chatID, user.ID)
	if err != nil {
		return chatPublic{}, err
	}
	return s.buildChatPublicFromRow(row, user)
}

func (s *Server) buildChatPublicFromRow(c featurechats.ChatDetails, user userPublic) (chatPublic, error) {
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
	if c.Preference != nil {
		chat.IsMuted = c.Preference.IsMuted
		chat.IsPinned = c.Preference.IsPinned
		chat.IsFavorite = c.Preference.IsFavorite
		if c.Preference.WallpaperFileID != nil && *c.Preference.WallpaperFileID != "" {
			if file, err := s.buildFilePublic(*c.Preference.WallpaperFileID, user.ID); err == nil && file.DeletedAt == nil {
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
		chat.ActiveCall = sess.PublicPayload()
	}

	return chat, nil
}

func (s *Server) populateLastMessagePreview(chat *chatPublic) error {
	preview, err := s.chatArchive.LastMessagePreview(context.Background(), chat.ID)
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
	users, err := s.chatArchive.Members(context.Background(), chatID)
	if err != nil {
		return nil, err
	}

	members := make([]chatMemberPublic, 0, len(users))
	presence := cache.NewPresenceService(s.cache)
	for _, u := range users {
		username := u.Username
		if u.Role == connectorRole {
			if alias, aliasErr := s.chatArchive.ConnectorAlias(context.Background(), u.ID); aliasErr == nil && alias != "" {
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
	return s.messageUnread.Count(context.Background(), chatID, userID)
}

func (s *Server) directApprovalStatus(chatID, userID string) (int, bool, error) {
	ids, err := s.chatArchive.MediaApprovalUserIDs(context.Background(), chatID)
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
	chatIDs, err := s.chatArchive.DirectChatIDs(context.Background())
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
		return s.chatSettings.SetMediaVisibility(ctx, chatID, desired)
	case "direct":
		if desired == "members" {
			return s.chatSettings.SetMediaVisibility(ctx, chatID, "members")
		}
		return s.chatSettings.ApproveDirectMediaVisibility(ctx, chatID, user.ID)
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
		createdAt, err := s.messageHistory.CreatedAt(context.Background(), before, chatID)
		if err != nil {
			return nil, false, errBadRequest
		}
		beforeCreatedAt = createdAt
	}
	ids, err := s.messageHistory.PageIDs(context.Background(), featuremessages.HistoryPage{
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
	commentCounts, err := s.messageHistory.ThreadCounts(context.Background(), chatID, rootMessageIDs)
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

func (s *Server) buildMessage(messageID, viewerID string) (messagePublic, error) {
	m, err := s.messageDetails.Load(context.Background(), messageID)
	if err != nil {
		return messagePublic{}, err
	}
	if !m.ChatFound {
		return messagePublic{}, errNotFound
	}
	familyID := m.FamilyID

	var message messagePublic
	message.ID = m.ID
	message.ChatID = m.ChatID
	message.SenderID = m.SenderID
	if m.SenderDisplayName != nil {
		name := *m.SenderDisplayName
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
	if message.Type == "poll" {
		pollObj, err := s.polls.GetPollByMessageID(context.Background(), message.ID)
		if err == nil {
			pollPub, err := s.buildPollPublic(context.Background(), pollObj.ID, viewerID)
			if err == nil {
				message.Poll = &pollPub
			}
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
		sender, err := s.messageDetails.Sender(context.Background(), *m.ForwardedFromMessageID)
		if err == nil {
			message.ForwardedFrom.SenderID = sender.ID
			message.ForwardedFrom.SenderDisplayName = sender.DisplayName
		}
	}
	if m.DeletedAt != nil {
		deleted := parseTime(*m.DeletedAt)
		message.DeletedAt = &deleted
	}
	message.IsEdited = m.IsEdited

	statuses, err := s.messageDetails.Statuses(context.Background(), messageID)
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

	reactions, err := s.messageDetails.Reactions(context.Background(), messageID)
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

	fileIDs, err := s.messageDetails.AttachmentFileIDs(context.Background(), messageID)
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
	meta, err := s.messageReads.Target(ctx, messageID)
	if err != nil {
		return messagePublic{}, "", errNotFound
	}
	if _, err := s.buildChatPublic(meta.ChatID, user); err != nil {
		return messagePublic{}, "", errNotFound
	}

	if err := s.messageReads.Mark(ctx, featuremessages.ReadCommand{Target: meta, UserID: user.ID, ReadAt: nowString()}); err != nil {
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
			uuid.NewString()+"-"+featurefiles.SanitizeFilename(file.OriginalName),
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

	metadata := make([]featurefiles.CloneMetadata, 0, len(clones))
	for _, clone := range clones {
		metadata = append(metadata, featurefiles.CloneMetadata{
			ID: clone.ID, FamilyID: targetChat.FamilyID, UploadedBy: user.ID, ChatID: targetChat.ID,
			AccessScope: "chat", StorageProvider: clone.StorageProvider, ObjectKey: clone.ObjectKey,
			ThumbnailObjectKey: clone.ThumbnailObjectKey, OriginalName: clone.OriginalName,
			MimeType: clone.MimeType, SizeBytes: clone.SizeBytes, Checksum: clone.Checksum, CreatedAt: now,
		})
	}
	if err := s.fileClones.Create(ctx, metadata); err != nil {
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
			_ = s.fileClones.Delete(context.Background(), clone.ID)
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

	chatID, err := s.messageReactions.MessageChatID(ctx, messageID)
	if err != nil {
		return messagePublic{}, errNotFound
	}
	if _, err := s.buildChatPublic(chatID, user); err != nil {
		return messagePublic{}, errNotFound
	}
	if err := s.messageReactions.Change(ctx, featuremessages.ReactionChange{MessageID: messageID, UserID: user.ID, Emoji: emoji, CreatedAt: nowString(), Add: add}); err != nil {
		return messagePublic{}, err
	}

	message, err := s.buildMessage(messageID, user.ID)
	if err != nil {
		return messagePublic{}, err
	}
	return message, nil
}

// editMessage is the application operation behind the HTTP transport. Request
// decoding and response serialization are intentionally kept out of app.
func (s *Server) editMessage(ctx context.Context, user userPublic, messageID, content string) (messagePublic, error) {
	meta, err := s.messageReads.Target(ctx, messageID)
	if err != nil {
		return messagePublic{}, newStatusError(http.StatusNotFound, "Message not found")
	}
	if meta.SenderID != user.ID {
		return messagePublic{}, newStatusError(http.StatusForbidden, "You can only edit your own messages")
	}

	chat, err := s.buildChatPublic(meta.ChatID, user)
	if err != nil {
		return messagePublic{}, newStatusError(http.StatusNotFound, "Chat not found")
	}

	now := nowString()
	if chat.EncryptionProtocol == encryptionProtocolServerAtRest {
		ciphertext, nonce, err := s.encryptServerAtRest(chat.FamilyID, content)
		if err != nil {
			return messagePublic{}, newStatusError(http.StatusInternalServerError, "Encryption failed")
		}
		if err := s.messageMutations.EditEncrypted(ctx, featuremessages.EncryptedEdit{MessageID: messageID, Ciphertext: ciphertext, Nonce: nonce, KeyVersion: 1, EncryptionMetadata: messageEncryptionMetadataServer, UpdatedAt: now}); err != nil {
			return messagePublic{}, newStatusError(http.StatusInternalServerError, "Failed to update message")
		}
	} else if err := s.messageMutations.EditPlain(ctx, featuremessages.PlainEdit{MessageID: messageID, Content: content, UpdatedAt: now}); err != nil {
		return messagePublic{}, newStatusError(http.StatusInternalServerError, "Failed to update message")
	}

	message, err := s.buildMessage(messageID, user.ID)
	if err != nil {
		return messagePublic{}, newStatusError(http.StatusInternalServerError, "Failed to load updated message")
	}
	s.emitMessageUpdated(meta.ChatID, message)
	s.bumpChatHistoryRevision(ctx, meta.ChatID)
	return message, nil
}

func (s *Server) deleteMessage(ctx context.Context, user userPublic, messageID, scope string) (map[string]string, error) {
	meta, err := s.messageReads.Target(ctx, messageID)
	if err != nil {
		return nil, newStatusError(http.StatusNotFound, "Message not found")
	}
	if meta.SenderID != user.ID {
		return nil, newStatusError(http.StatusForbidden, "You can only delete your own messages")
	}

	if scope == "me" {
		if err := s.messageMutations.Delete(ctx, featuremessages.Deletion{MessageID: messageID, UserID: user.ID, DeletedAt: nowString(), ForUserOnly: true}); err != nil {
			return nil, newStatusError(http.StatusInternalServerError, "Failed to delete message")
		}
		s.bumpUserChatHistoryRevision(ctx, user.ID, meta.ChatID)
	} else {
		if err := s.messageMutations.Delete(ctx, featuremessages.Deletion{MessageID: messageID, DeletedAt: nowString()}); err != nil {
			return nil, newStatusError(http.StatusInternalServerError, "Failed to delete message")
		}
		s.emitMessageDeleted(meta.ChatID, messageID)
		s.bumpChatHistoryRevision(ctx, meta.ChatID)
	}
	return map[string]string{"messageId": messageID, "chatId": meta.ChatID}, nil
}

func (s *Server) createMessageFromSocket(user userPublic, payload socketSendMessageRequest) (messagePublic, error) {
	request := sendMessageRequest{
		Type:                "",
		Content:             payload.Content,
		FileIDs:             payload.FileIDs,
		ReplyToMessageID:    payload.ReplyToMessageID,
		ThreadRootMessageID: payload.ThreadRootMessageID,
		EncryptionProtocol:  payload.EncryptionProtocol,
		Ciphertext:          payload.Ciphertext,
		Nonce:               payload.Nonce,
		KeyVersion:          payload.KeyVersion,
		EncryptionMetadata:  payload.EncryptionMetadata,
		MentionedUserIDs:    payload.MentionedUserIDs,
	}
	message, err := s.createMessageWithPayload(user, payload.ChatID, request, payload.ClientMessageID, nil)
	if err != nil {
		return messagePublic{}, err
	}
	return message, nil
}

func (s *Server) createMessageWithPayload(user userPublic, chatID string, payload sendMessageRequest, clientMessageID *string, forwarded *messageForwardSource) (messagePublic, error) {
	return s.createMessageWithPayloadContext(context.Background(), user, chatID, payload, clientMessageID, forwarded)
}

func (s *Server) createMessageWithPayloadContext(ctx context.Context, user userPublic, chatID string, payload sendMessageRequest, clientMessageID *string, forwarded *messageForwardSource) (messagePublic, error) {
	return s.createMessageWithPayloadContextOptions(ctx, user, chatID, payload, clientMessageID, forwarded, false)
}

// createGeneratedMessageWithPayloadContext creates a durable server-generated
// chat message. It keeps ordinary chat permissions and encryption rules but
// bypasses slow mode so a completed call's notes are never silently dropped.
func (s *Server) createGeneratedMessageWithPayloadContext(ctx context.Context, user userPublic, chatID string, payload sendMessageRequest) (messagePublic, error) {
	return s.createMessageWithPayloadContextOptions(ctx, user, chatID, payload, nil, nil, true)
}

func (s *Server) createMessageWithPayloadContextOptions(ctx context.Context, user userPublic, chatID string, payload sendMessageRequest, clientMessageID *string, forwarded *messageForwardSource, skipMessageDelay bool) (messagePublic, error) {
	chat, err := s.buildChatPublic(chatID, user)
	if err != nil {
		return messagePublic{}, errNotFound
	}
	if err := s.validateMessageSendPermissions(ctx, chat, user, &payload); err != nil {
		return messagePublic{}, err
	}
	if !skipMessageDelay {
		if err := s.checkMessageDelay(ctx, chat, user, chatID); err != nil {
			return messagePublic{}, err
		}
	}
	content, encryptionProtocol, ciphertext, nonce, keyVersion, metadata, attachments, messageType, err := s.resolveMessageContent(chat, user, chatID, payload)
	if err != nil {
		return messagePublic{}, err
	}

	onlineRecipients := s.onlineChatRecipients(chat, user.ID)
	messageID := uuid.NewString()
	now := nowString()
	var forwardedMessageID, forwardedChatID *string
	if forwarded != nil {
		forwardedMessageID = &forwarded.MessageID
		forwardedChatID = &forwarded.ChatID
	}
	messageKind := "chat"
	if payload.ThreadRootMessageID != nil {
		messageKind = "thread"
	}
	attachmentFileIDs := make([]string, 0, len(attachments))
	for _, file := range attachments {
		attachmentFileIDs = append(attachmentFileIDs, file.ID)
	}
	err = s.messagePersistence.Create(ctx, featuremessages.MessageBundle{
		MessageID:              messageID,
		ChatID:                 chatID,
		SenderID:               user.ID,
		Type:                   messageType,
		Content:                content,
		EncryptionProtocol:     encryptionProtocol,
		Ciphertext:             ciphertext,
		Nonce:                  nonce,
		KeyVersion:             keyVersion,
		EncryptionMetadata:     metadata,
		ReplyToMessageID:       payload.ReplyToMessageID,
		ThreadRootMessageID:    payload.ThreadRootMessageID,
		MessageKind:            messageKind,
		ForwardedFromMessageID: forwardedMessageID,
		ForwardedFromChatID:    forwardedChatID,
		CreatedAt:              now,
		AttachmentFileIDs:      attachmentFileIDs,
		DeliveredRecipientIDs:  onlineRecipients,
	})
	if err != nil {
		return messagePublic{}, err
	}
	message, err := s.buildMessage(messageID, user.ID)
	if err != nil {
		return messagePublic{}, err
	}
	message.ClientMessageID = clientMessageID
	s.bumpChatHistoryRevision(ctx, chatID)
	delivery := featuremessages.NewDeliveryService(newMessageDeliveryAdapter(s))
	createdEvent := domain.MessageCreated{EventID: uuid.NewString(), ChatID: chatID, MessageID: message.ID, Payload: toMap(message)}

	mentionedUserIDs := payload.MentionedUserIDs
	if len(mentionedUserIDs) == 0 && content != nil && *content != "" {
		mentionedUserIDs = extractMentionedUserIDsFromContent(chat.Members, user.ID, *content)
	}

	notification := domain.MessageNotification{
		ChatID: chatID, ChatType: chat.Type, ChatTitle: chat.Title, SenderID: user.ID,
		SenderName: user.DisplayName, Preview: truncatePreview(message.Content), MentionedUserIDs: mentionedUserIDs,
	}
	go func() {
		if err := delivery.PublishCreated(context.Background(), createdEvent); err != nil {
			s.logger.Warnf("realtime", "broker publish failed channel=%s chat_id=%s error=%v", brokerChannelMessages, chatID, err)
			s.emitMessageNew(chat, message)
		}
	}()
	go delivery.NotifyRecipients(context.Background(), notification)
	return message, nil
}

// validateMessageSendPermissions checks block lists, channel post permissions,
// and reply-target validity. It also normalises the payload's reply/thread fields.
func (s *Server) validateMessageSendPermissions(ctx context.Context, chat chatPublic, user userPublic, payload *sendMessageRequest) error {
	input := &domain.SendMessage{ReplyToMessageID: payload.ReplyToMessageID, ThreadRootMessageID: payload.ThreadRootMessageID}
	service := featuremessages.NewService(messagePolicyAdapter{server: s})
	err := service.ValidateSend(ctx, messageDomainChat(chat), domain.Sender{ID: user.ID, Role: user.Role}, input)
	switch err {
	case nil:
		payload.ReplyToMessageID, payload.ThreadRootMessageID = input.ReplyToMessageID, input.ThreadRootMessageID
		return nil
	case featuremessages.ErrForbidden:
		return errForbidden
	case featuremessages.ErrDirectBlocked:
		return newStatusError(403, "direct messages are unavailable for this member")
	default:
		return err
	}
}

// checkMessageDelay enforces per-chat slow-mode rate limiting for non-managers.
func (s *Server) checkMessageDelay(ctx context.Context, chat chatPublic, user userPublic, chatID string) error {
	err := s.messageDelay.Check(ctx, featuremessages.SlowModeInput{
		ChatID: chatID, SenderID: user.ID, DelaySeconds: chat.MessageDelaySeconds,
		CanManage: s.canManageChat(chat, user),
	})
	var slowMode *featuremessages.SlowModeError
	if errors.As(err, &slowMode) {
		return newStatusError(429, fmt.Sprintf("Message delay is active. Please wait %d second(s).", slowMode.RemainingSeconds))
	}
	return err
}

// resolveMessageContent validates and prepares all message content fields:
// text, encryption, attachments, and message type.
func (s *Server) resolveMessageContent(chat chatPublic, user userPublic, chatID string, payload sendMessageRequest) (
	content *string, encryptionProtocol string, ciphertext, nonce *string, keyVersion *int, metadata *string,
	attachments []filePublic, messageType string, err error,
) {
	content = trimStringPointer(payload.Content)
	if content != nil && *content == "" {
		content = nil
	}
	if content != nil && len(*content) > 4000 {
		return nil, "", nil, nil, nil, nil, nil, "", newStatusError(422, "message content is too long")
	}
	encryptionProtocol, ciphertext, nonce, keyVersion, metadata, err = s.prepareMessageEncryption(chat, content, payload)
	if err != nil {
		return nil, "", nil, nil, nil, nil, nil, "", err
	}
	if content == nil && ciphertext == nil && len(payload.FileIDs) == 0 && !payload.AttachmentsPending {
		return nil, "", nil, nil, nil, nil, nil, "", errBadRequest
	}
	attachments, err = s.loadAttachmentsForMessage(payload.FileIDs, user, chatID)
	if err != nil {
		return nil, "", nil, nil, nil, nil, nil, "", err
	}
	messageType = payload.Type
	if messageType == "" {
		messageType = chooseMessageType(content, attachments)
		if payload.AttachmentsPending && len(attachments) == 0 {
			messageType = "mixed"
		}
	}
	if messageType != "text" && messageType != "image" && messageType != "video" && messageType != "file" && messageType != "mixed" {
		return nil, "", nil, nil, nil, nil, nil, "", errBadRequest
	}
	return content, encryptionProtocol, ciphertext, nonce, keyVersion, metadata, attachments, messageType, nil
}

// onlineChatRecipients returns a slice of IDs of chat members (excluding sender) who are currently online.
func (s *Server) onlineChatRecipients(chat chatPublic, senderID string) []string {
	recipients := make([]string, 0)
	for _, member := range chat.Members {
		if member.ID != senderID && s.sessions.IsOnline(member.ID) {
			recipients = append(recipients, member.ID)
		}
	}
	return recipients
}

func (s *Server) validateReplyTarget(chatID, replyToMessageID string) error {
	ok, err := s.messageHistory.ActiveInChat(context.Background(), replyToMessageID, chatID)
	if err != nil {
		return err
	}
	if !ok {
		return newStatusError(422, "invalid reply target")
	}
	return nil
}

func (s *Server) prepareMessageEncryption(chat chatPublic, content *string, payload sendMessageRequest) (string, *string, *string, *int, *string, error) {
	protocol, err := normalizeEncryptionProtocol(chat.EncryptionProtocol)
	if err != nil {
		protocol = encryptionProtocolServerAtRest
	}
	if payload.EncryptionProtocol != nil && strings.TrimSpace(*payload.EncryptionProtocol) != "" {
		requested, err := normalizeEncryptionProtocol(*payload.EncryptionProtocol)
		if err != nil {
			return "", nil, nil, nil, nil, err
		}
		if requested != protocol {
			return "", nil, nil, nil, nil, fmt.Errorf("message encryption protocol does not match chat")
		}
	}
	switch protocol {
	case encryptionProtocolEndToEnd:
		if content != nil && strings.TrimSpace(*content) != "" {
			return "", nil, nil, nil, nil, fmt.Errorf("end-to-end encrypted messages cannot include plaintext content")
		}
		ciphertext := trimStringPointer(payload.Ciphertext)
		nonce := trimStringPointer(payload.Nonce)
		metadata := trimStringPointer(payload.EncryptionMetadata)
		if ciphertext == nil && len(payload.FileIDs) == 0 {
			return "", nil, nil, nil, nil, fmt.Errorf("encrypted content is required")
		}
		if ciphertext != nil && nonce == nil {
			return "", nil, nil, nil, nil, fmt.Errorf("encryption nonce is required")
		}
		keyVersion := payload.KeyVersion
		if keyVersion == nil && ciphertext != nil {
			value := 1
			keyVersion = &value
		}
		return protocol, ciphertext, nonce, keyVersion, metadata, nil
	case encryptionProtocolServerAtRest:
		if content == nil {
			return protocol, nil, nil, nil, nil, nil
		}
		ciphertext, nonce, err := s.encryptServerAtRest(chat.FamilyID, *content)
		if err != nil {
			return "", nil, nil, nil, nil, err
		}
		keyVersion := 1
		metadata := messageEncryptionMetadataServer
		return protocol, &ciphertext, &nonce, &keyVersion, &metadata, nil
	default:
		return encryptionProtocolLegacyPlain, nil, nil, nil, nil, nil
	}
}

func (s *Server) emitMessageNew(chat chatPublic, message messagePublic) {
	memberIDs := realtimeMemberIDs(chat.Members)
	realtimetransport.EmitToUsers(s.emitToUserRoom, memberIDs, "message:new", message)
	onlineRecipients := make([]string, 0)
	for _, member := range chat.Members {
		if member.ID == message.SenderID {
			continue
		}
		if s.sessions.IsOnline(member.ID) {
			onlineRecipients = append(onlineRecipients, member.ID)
		}
	}
	if len(onlineRecipients) > 0 {
		payload := realtimetransport.MessageDeliveredPayload(message.ChatID, message.ID, onlineRecipients)
		realtimetransport.EmitToUsers(s.emitToUserRoom, memberIDs, "message:delivered", payload)
	}

	// Queue for offline recipients
	for _, member := range chat.Members {
		if member.ID == message.SenderID {
			continue
		}
		if s.sessions.IsOnline(member.ID) {
			continue
		}
		mID := member.ID
		go s.enqueueEventForUser(context.Background(), mID, "message:new", message)
	}
}

func (s *Server) emitMessageRead(chatID, messageID, userID string) {
	members, err := s.chatMembers(chatID)
	if err != nil {
		return
	}
	payload := realtimetransport.MessageReadPayload(chatID, messageID, userID)
	realtimetransport.EmitToUsers(s.emitToUserRoom, realtimeMemberIDs(members), "message:read", payload)
}

func (s *Server) emitMessageUpdated(chatID string, message messagePublic) {
	members, err := s.chatMembers(chatID)
	if err != nil {
		return
	}
	realtimetransport.EmitToUsers(s.emitToUserRoom, realtimeMemberIDs(members), "message:updated", message)
}

func (s *Server) emitMessageDeleted(chatID string, messageID string) {
	members, err := s.chatMembers(chatID)
	if err != nil {
		return
	}
	payload := realtimetransport.MessageDeletedPayload(chatID, messageID)
	realtimetransport.EmitToUsers(s.emitToUserRoom, realtimeMemberIDs(members), "message:deleted", payload)
}

func (s *Server) emitMessagePinned(chatID string, pin pinnedMessagePublic) {
	members, err := s.chatMembers(chatID)
	if err != nil {
		return
	}
	realtimetransport.EmitToUsers(s.emitToUserRoom, realtimeMemberIDs(members), "message:pinned", pin)
}

func (s *Server) emitMessageUnpinned(chatID string, messageID string) {
	members, err := s.chatMembers(chatID)
	if err != nil {
		return
	}
	payload := realtimetransport.MessageUnpinnedPayload(chatID, messageID)
	realtimetransport.EmitToUsers(s.emitToUserRoom, realtimeMemberIDs(members), "message:unpinned", payload)
}

func (s *Server) emitTyping(chatID string, user userPublic, isTyping bool) error {
	chat, err := s.buildChatPublic(chatID, user)
	if err != nil {
		return err
	}
	typing := cache.NewTypingService(s.cache)
	if isTyping {
		if err := typing.StartTyping(context.Background(), chatID, user.ID, 10); err != nil {
			s.logger.Warnf("realtime", "typing start update failed chat_id=%s user_id=%s error=%v", chatID, user.ID, err)
		}
	} else {
		if err := typing.StopTyping(context.Background(), chatID, user.ID); err != nil {
			s.logger.Warnf("realtime", "typing stop update failed chat_id=%s user_id=%s error=%v", chatID, user.ID, err)
		}
	}
	payload := realtimetransport.TypingPayload(chatID, user.ID, user.DisplayName, isTyping)
	recipients := make([]string, 0, len(chat.Members)-1)
	for _, member := range chat.Members {
		if member.ID != user.ID {
			recipients = append(recipients, member.ID)
		}
	}
	realtimetransport.EmitToUsers(s.emitToUserRoom, recipients, "typing:update", payload)
	return nil
}

func realtimeMemberIDs(members []chatMemberPublic) []string {
	userIDs := make([]string, 0, len(members))
	for _, member := range members {
		userIDs = append(userIDs, member.ID)
	}
	return userIDs
}

func extractMentionedUserIDsFromContent(members []chatMemberPublic, senderID string, content string) []string {
	if content == "" || len(members) == 0 {
		return nil
	}
	var mentioned []string
	seen := make(map[string]bool)

	for _, member := range members {
		if member.ID == senderID || seen[member.ID] {
			continue
		}
		handles := []string{}
		if strings.TrimSpace(member.Username) != "" {
			handles = append(handles, member.Username)
		}
		if strings.TrimSpace(member.DisplayName) != "" {
			handles = append(handles, member.DisplayName)
		}

		for _, handle := range handles {
			trimmed := strings.TrimSpace(handle)
			if trimmed == "" {
				continue
			}
			escaped := regexp.QuoteMeta(trimmed)
			re, err := regexp.Compile(`(?i)(?:^|\s)@` + escaped + `(?:\s|$|[.,!?])`)
			if err == nil && re.MatchString(content) {
				mentioned = append(mentioned, member.ID)
				seen[member.ID] = true
				break
			}
		}
	}
	return mentioned
}


