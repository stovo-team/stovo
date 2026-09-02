package featurepolls

import (
	"context"
)

type PollOption struct {
	ID          string
	PollID      string
	Text        string
	OptionIndex int
}

type Poll struct {
	ID              string
	ChatID          string
	MessageID       string
	Question        string
	IsAnonymous     bool
	AllowMultiple   bool
	IsQuiz          bool
	CorrectOptionID *string
	Explanation     *string
	IsClosed        bool
	CreatedAt       string
	ClosedAt        *string
}

type PollVote struct {
	ID        string
	PollID    string
	OptionID  string
	UserID    string
	CreatedAt string
}

type CreatePollParams struct {
	ID              string
	ChatID          string
	MessageID       string
	Question        string
	IsAnonymous     bool
	AllowMultiple   bool
	IsQuiz          bool
	CorrectOptionID *string
	Explanation     *string
	CreatedAt       string
	Options         []string
}

type Store interface {
	CreatePoll(ctx context.Context, p CreatePollParams) (Poll, []PollOption, error)
	GetPollByMessageID(ctx context.Context, messageID string) (Poll, error)
	GetPollByID(ctx context.Context, pollID string) (Poll, error)
	ListPollOptions(ctx context.Context, pollID string) ([]PollOption, error)
	ListPollVotes(ctx context.Context, pollID string) ([]PollVote, error)
	CastPollVotes(ctx context.Context, pollID, userID string, optionIDs []string, createdAt string) error
	ClosePoll(ctx context.Context, pollID, closedAt string) (Poll, error)
}

type Service struct {
	store Store
}

func NewService(store Store) *Service {
	return &Service{store: store}
}

func (s *Service) CreatePoll(ctx context.Context, p CreatePollParams) (Poll, []PollOption, error) {
	return s.store.CreatePoll(ctx, p)
}

func (s *Service) GetPollByMessageID(ctx context.Context, messageID string) (Poll, error) {
	return s.store.GetPollByMessageID(ctx, messageID)
}

func (s *Service) GetPollByID(ctx context.Context, pollID string) (Poll, error) {
	return s.store.GetPollByID(ctx, pollID)
}

func (s *Service) ListPollOptions(ctx context.Context, pollID string) ([]PollOption, error) {
	return s.store.ListPollOptions(ctx, pollID)
}

func (s *Service) ListPollVotes(ctx context.Context, pollID string) ([]PollVote, error) {
	return s.store.ListPollVotes(ctx, pollID)
}

func (s *Service) CastPollVotes(ctx context.Context, pollID, userID string, optionIDs []string, createdAt string) error {
	return s.store.CastPollVotes(ctx, pollID, userID, optionIDs, createdAt)
}

func (s *Service) ClosePoll(ctx context.Context, pollID, closedAt string) (Poll, error) {
	return s.store.ClosePoll(ctx, pollID, closedAt)
}
