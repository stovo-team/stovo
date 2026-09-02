package app

import (
	"context"
	"fmt"
	"net/http"
	"strings"

	"github.com/google/uuid"

	featuremessages "stovo-messenger/backend/internal/features/messages"
	featurepolls "stovo-messenger/backend/internal/features/polls"
)

type userSummaryPublic struct {
	ID           string      `json:"id"`
	DisplayName  string      `json:"displayName"`
	Username     string      `json:"username"`
	ProfilePhoto *filePublic `json:"profilePhoto,omitempty"`
}

func (s *Server) buildPollPublic(ctx context.Context, pollID string, viewerID string) (pollPublic, error) {
	pollObj, err := s.polls.GetPollByID(ctx, pollID)
	if err != nil {
		return pollPublic{}, err
	}
	options, err := s.polls.ListPollOptions(ctx, pollID)
	if err != nil {
		return pollPublic{}, err
	}
	votes, err := s.polls.ListPollVotes(ctx, pollID)
	if err != nil {
		return pollPublic{}, err
	}

	voteCounts := make(map[string]int)
	votedOptions := make(map[string]bool)
	optionVoterIDs := make(map[string][]string)
	uniqueVoters := make(map[string]bool)

	for _, v := range votes {
		voteCounts[v.OptionID]++
		uniqueVoters[v.UserID] = true
		if v.UserID == viewerID {
			votedOptions[v.OptionID] = true
		}
		if !pollObj.IsAnonymous {
			optionVoterIDs[v.OptionID] = append(optionVoterIDs[v.OptionID], v.UserID)
		}
	}

	optsPublic := make([]pollOptionPublic, 0, len(options))
	for _, opt := range options {
		optPub := pollOptionPublic{
			ID:          opt.ID,
			Text:        opt.Text,
			OptionIndex: opt.OptionIndex,
			VoteCount:   voteCounts[opt.ID],
			Voted:       votedOptions[opt.ID],
		}
		if !pollObj.IsAnonymous {
			optPub.VoterIDs = optionVoterIDs[opt.ID]
			if optPub.VoterIDs == nil {
				optPub.VoterIDs = []string{}
			}
		}
		optsPublic = append(optsPublic, optPub)
	}

	res := pollPublic{
		ID:              pollObj.ID,
		ChatID:          pollObj.ChatID,
		MessageID:       pollObj.MessageID,
		Question:        pollObj.Question,
		IsAnonymous:     pollObj.IsAnonymous,
		AllowMultiple:   pollObj.AllowMultiple,
		IsQuiz:          pollObj.IsQuiz,
		CorrectOptionID: pollObj.CorrectOptionID,
		Explanation:     pollObj.Explanation,
		IsClosed:        pollObj.IsClosed,
		TotalVoters:     len(uniqueVoters),
		CreatedAt:       pollObj.CreatedAt,
		ClosedAt:        pollObj.ClosedAt,
		Options:         optsPublic,
	}

	return res, nil
}

func (s *Server) createPoll(ctx context.Context, user userPublic, chatID string, request createPollRequest) (any, int, error) {
	chat, err := s.buildChatPublic(chatID, user)
	if err != nil {
		return nil, 0, newStatusError(http.StatusNotFound, "Chat not found")
	}

	question := strings.TrimSpace(request.Question)
	if question == "" || len(question) > 255 {
		return nil, 0, newStatusError(http.StatusUnprocessableEntity, "Poll question must be between 1 and 255 characters")
	}

	if len(request.Options) < 2 || len(request.Options) > 10 {
		return nil, 0, newStatusError(http.StatusUnprocessableEntity, "Poll must have between 2 and 10 options")
	}

	optionTexts := make([]string, 0, len(request.Options))
	for i, opt := range request.Options {
		t := strings.TrimSpace(opt.Text)
		if t == "" || len(t) > 100 {
			return nil, 0, newStatusError(http.StatusUnprocessableEntity, fmt.Sprintf("Option %d must be non-empty and under 100 characters", i+1))
		}
		optionTexts = append(optionTexts, t)
	}

	var correctOptionID *string
	if request.IsQuiz {
		if request.CorrectOptionIndex == nil || *request.CorrectOptionIndex < 0 || *request.CorrectOptionIndex >= len(optionTexts) {
			return nil, 0, newStatusError(http.StatusUnprocessableEntity, "Quiz poll requires a valid correct option selection")
		}
		formattedIndex := fmt.Sprintf("idx:%d", *request.CorrectOptionIndex)
		correctOptionID = &formattedIndex
	}

	messageID := uuid.NewString()
	pollID := uuid.NewString()
	createdAtStr := nowString()

	err = s.messagePersistence.Create(ctx, featuremessages.MessageBundle{
		MessageID:           messageID,
		ChatID:              chatID,
		SenderID:            user.ID,
		Type:                "poll",
		Content:             &question,
		ReplyToMessageID:    request.ReplyToMessageID,
		MessageKind:         "chat",
		CreatedAt:           createdAtStr,
	})
	if err != nil {
		return nil, 0, newStatusError(http.StatusInternalServerError, "Could not create poll message")
	}

	// Create poll in DB
	_, _, err = s.polls.CreatePoll(ctx, featurepolls.CreatePollParams{
		ID:              pollID,
		ChatID:          chatID,
		MessageID:       messageID,
		Question:        question,
		IsAnonymous:     request.IsAnonymous,
		AllowMultiple:   request.AllowMultiple,
		IsQuiz:          request.IsQuiz,
		CorrectOptionID: correctOptionID,
		Explanation:     request.Explanation,
		CreatedAt:       createdAtStr,
		Options:         optionTexts,
	})
	if err != nil {
		return nil, 0, newStatusError(http.StatusInternalServerError, "Could not store poll details")
	}

	message, buildErr := s.buildMessage(messageID, user.ID)
	if buildErr != nil {
		return nil, 0, newStatusError(http.StatusInternalServerError, "Could not load created poll message")
	}

	// Broadcast message creation event to room members
	s.broadcastPollEvent(chat, "chat.message", message)

	return message, http.StatusCreated, nil
}

func (s *Server) votePoll(ctx context.Context, user userPublic, pollID string, request votePollRequest) (any, int, error) {
	pollObj, err := s.polls.GetPollByID(ctx, pollID)
	if err != nil {
		return nil, 0, newStatusError(http.StatusNotFound, "Poll not found")
	}

	if pollObj.IsClosed {
		return nil, 0, newStatusError(http.StatusBadRequest, "Voting is closed for this poll")
	}

	chat, err := s.buildChatPublic(pollObj.ChatID, user)
	if err != nil {
		return nil, 0, newStatusError(http.StatusForbidden, "You are not a member of this chat")
	}

	if !pollObj.AllowMultiple && len(request.OptionIDs) > 1 {
		return nil, 0, newStatusError(http.StatusBadRequest, "Multiple answers are not allowed for this poll")
	}

	// Verify options belong to this poll
	existingOpts, err := s.polls.ListPollOptions(ctx, pollID)
	if err != nil {
		return nil, 0, newStatusError(http.StatusInternalServerError, "Could not fetch poll options")
	}
	validOptMap := make(map[string]bool)
	for _, opt := range existingOpts {
		validOptMap[opt.ID] = true
	}
	for _, optID := range request.OptionIDs {
		if !validOptMap[optID] {
			return nil, 0, newStatusError(http.StatusBadRequest, "Invalid option selection")
		}
	}

	err = s.polls.CastPollVotes(ctx, pollID, user.ID, request.OptionIDs, nowString())
	if err != nil {
		return nil, 0, newStatusError(http.StatusInternalServerError, "Could not save votes")
	}

	pollPub, err := s.buildPollPublic(ctx, pollID, user.ID)
	if err != nil {
		return nil, 0, newStatusError(http.StatusInternalServerError, "Could not load updated poll")
	}

	// Broadcast poll update to chat members
	s.broadcastPollEvent(chat, "poll.updated", pollPub)

	return pollPub, http.StatusOK, nil
}

func (s *Server) closePoll(ctx context.Context, user userPublic, pollID string) (any, int, error) {
	pollObj, err := s.polls.GetPollByID(ctx, pollID)
	if err != nil {
		return nil, 0, newStatusError(http.StatusNotFound, "Poll not found")
	}

	chat, err := s.buildChatPublic(pollObj.ChatID, user)
	if err != nil {
		return nil, 0, newStatusError(http.StatusForbidden, "You are not a member of this chat")
	}

	// Check if user is the poll creator or chat admin
	msg, err := s.messageDetails.Load(ctx, pollObj.MessageID)
	if err != nil {
		return nil, 0, newStatusError(http.StatusInternalServerError, "Could not verify poll creator")
	}
	isCreator := msg.SenderID == user.ID
	isAdmin := s.canManageChat(chat, user)

	if !isCreator && !isAdmin {
		return nil, 0, newStatusError(http.StatusForbidden, "Only the poll creator or chat admin can close the poll")
	}

	_, err = s.polls.ClosePoll(ctx, pollID, nowString())
	if err != nil {
		return nil, 0, newStatusError(http.StatusInternalServerError, "Could not close poll")
	}

	pollPub, err := s.buildPollPublic(ctx, pollID, user.ID)
	if err != nil {
		return nil, 0, newStatusError(http.StatusInternalServerError, "Could not load updated poll")
	}

	s.broadcastPollEvent(chat, "poll.updated", pollPub)

	return pollPub, http.StatusOK, nil
}

func (s *Server) getPollVoters(ctx context.Context, user userPublic, pollID string) (any, int, error) {
	pollObj, err := s.polls.GetPollByID(ctx, pollID)
	if err != nil {
		return nil, 0, newStatusError(http.StatusNotFound, "Poll not found")
	}

	if pollObj.IsAnonymous {
		return nil, 0, newStatusError(http.StatusForbidden, "Voters are anonymous for this poll")
	}

	_, err = s.buildChatPublic(pollObj.ChatID, user)
	if err != nil {
		return nil, 0, newStatusError(http.StatusForbidden, "You are not a member of this chat")
	}

	votes, err := s.polls.ListPollVotes(ctx, pollID)
	if err != nil {
		return nil, 0, newStatusError(http.StatusInternalServerError, "Could not load poll votes")
	}

	voterMap := make(map[string][]userSummaryPublic)
	for _, v := range votes {
		u, err := s.getUserByID(v.UserID)
		if err != nil {
			continue
		}
		voterMap[v.OptionID] = append(voterMap[v.OptionID], userSummaryPublic{
			ID:           u.ID,
			DisplayName:  u.DisplayName,
			Username:     u.Username,
			ProfilePhoto: u.ProfilePhoto,
		})
	}

	return voterMap, http.StatusOK, nil
}

func (s *Server) broadcastPollEvent(chat chatPublic, event string, payload any) {
	for _, m := range chat.Members {
		if s.sockets != nil {
			_ = s.sockets.To("user:" + m.ID).Emit(event, payload)
		}
	}
}
