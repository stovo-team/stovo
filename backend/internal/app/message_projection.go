package app

import (
	"context"
	"encoding/json"
	"strings"
)

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
	if message.Type == "collection" {
		message.Collection = s.collectionCardForMessage(context.Background(), message.ID, viewerID)
	}
	if message.Type == "canvas" {
		message.Canvas = s.canvasCardForMessage(context.Background(), message.ID, viewerID)
	}
	if message.Type == "checklist" {
		message.Checklist = s.checklistCardForMessage(context.Background(), message.ID, viewerID)
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
	message.ImportAttribution, err = s.loadMessageImportAttribution(context.Background(), messageID)
	if err != nil {
		return messagePublic{}, err
	}

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
