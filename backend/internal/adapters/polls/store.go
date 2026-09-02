package polls

import (
	"context"

	featurepolls "stovo-messenger/backend/internal/features/polls"
	"stovo-messenger/backend/internal/repository"
)

type Store struct {
	repository *repository.Store
}

func NewStore(repository *repository.Store) *Store {
	return &Store{repository: repository}
}

func (s *Store) CreatePoll(ctx context.Context, p featurepolls.CreatePollParams) (featurepolls.Poll, []featurepolls.PollOption, error) {
	pollObj, options, err := s.repository.CreatePoll(ctx, repository.CreatePollParams{
		ID:              p.ID,
		ChatID:          p.ChatID,
		MessageID:       p.MessageID,
		Question:        p.Question,
		IsAnonymous:     p.IsAnonymous,
		AllowMultiple:   p.AllowMultiple,
		IsQuiz:          p.IsQuiz,
		CorrectOptionID: p.CorrectOptionID,
		Explanation:     p.Explanation,
		CreatedAt:       p.CreatedAt,
		Options:         p.Options,
	})
	if err != nil {
		return featurepolls.Poll{}, nil, err
	}

	resPoll := featurepolls.Poll{
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
		CreatedAt:       pollObj.CreatedAt,
		ClosedAt:        pollObj.ClosedAt,
	}

	resOpts := make([]featurepolls.PollOption, 0, len(options))
	for _, opt := range options {
		resOpts = append(resOpts, featurepolls.PollOption{
			ID:          opt.ID,
			PollID:      opt.PollID,
			Text:        opt.Text,
			OptionIndex: opt.OptionIndex,
		})
	}

	return resPoll, resOpts, nil
}

func (s *Store) GetPollByMessageID(ctx context.Context, messageID string) (featurepolls.Poll, error) {
	p, err := s.repository.GetPollByMessageID(ctx, messageID)
	if err != nil {
		return featurepolls.Poll{}, err
	}
	return featurepolls.Poll{
		ID:              p.ID,
		ChatID:          p.ChatID,
		MessageID:       p.MessageID,
		Question:        p.Question,
		IsAnonymous:     p.IsAnonymous,
		AllowMultiple:   p.AllowMultiple,
		IsQuiz:          p.IsQuiz,
		CorrectOptionID: p.CorrectOptionID,
		Explanation:     p.Explanation,
		IsClosed:        p.IsClosed,
		CreatedAt:       p.CreatedAt,
		ClosedAt:        p.ClosedAt,
	}, nil
}

func (s *Store) GetPollByID(ctx context.Context, pollID string) (featurepolls.Poll, error) {
	p, err := s.repository.GetPollByID(ctx, pollID)
	if err != nil {
		return featurepolls.Poll{}, err
	}
	return featurepolls.Poll{
		ID:              p.ID,
		ChatID:          p.ChatID,
		MessageID:       p.MessageID,
		Question:        p.Question,
		IsAnonymous:     p.IsAnonymous,
		AllowMultiple:   p.AllowMultiple,
		IsQuiz:          p.IsQuiz,
		CorrectOptionID: p.CorrectOptionID,
		Explanation:     p.Explanation,
		IsClosed:        p.IsClosed,
		CreatedAt:       p.CreatedAt,
		ClosedAt:        p.ClosedAt,
	}, nil
}

func (s *Store) ListPollOptions(ctx context.Context, pollID string) ([]featurepolls.PollOption, error) {
	options, err := s.repository.ListPollOptions(ctx, pollID)
	if err != nil {
		return nil, err
	}
	res := make([]featurepolls.PollOption, 0, len(options))
	for _, opt := range options {
		res = append(res, featurepolls.PollOption{
			ID:          opt.ID,
			PollID:      opt.PollID,
			Text:        opt.Text,
			OptionIndex: opt.OptionIndex,
		})
	}
	return res, nil
}

func (s *Store) ListPollVotes(ctx context.Context, pollID string) ([]featurepolls.PollVote, error) {
	votes, err := s.repository.ListPollVotes(ctx, pollID)
	if err != nil {
		return nil, err
	}
	res := make([]featurepolls.PollVote, 0, len(votes))
	for _, v := range votes {
		res = append(res, featurepolls.PollVote{
			ID:        v.ID,
			PollID:    v.PollID,
			OptionID:  v.OptionID,
			UserID:    v.UserID,
			CreatedAt: v.CreatedAt,
		})
	}
	return res, nil
}

func (s *Store) CastPollVotes(ctx context.Context, pollID, userID string, optionIDs []string, createdAt string) error {
	return s.repository.CastPollVotes(ctx, pollID, userID, optionIDs, createdAt)
}

func (s *Store) ClosePoll(ctx context.Context, pollID, closedAt string) (featurepolls.Poll, error) {
	p, err := s.repository.ClosePoll(ctx, pollID, closedAt)
	if err != nil {
		return featurepolls.Poll{}, err
	}
	return featurepolls.Poll{
		ID:              p.ID,
		ChatID:          p.ChatID,
		MessageID:       p.MessageID,
		Question:        p.Question,
		IsAnonymous:     p.IsAnonymous,
		AllowMultiple:   p.AllowMultiple,
		IsQuiz:          p.IsQuiz,
		CorrectOptionID: p.CorrectOptionID,
		Explanation:     p.Explanation,
		IsClosed:        p.IsClosed,
		CreatedAt:       p.CreatedAt,
		ClosedAt:        p.ClosedAt,
	}, nil
}

var _ featurepolls.Store = (*Store)(nil)
