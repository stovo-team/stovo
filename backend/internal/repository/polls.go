package repository

import (
	"context"

	"stovo-messenger/backend/ent"
	"stovo-messenger/backend/ent/poll"
	"stovo-messenger/backend/ent/polloption"
	"stovo-messenger/backend/ent/pollvote"
)

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

// CreatePoll creates the poll record and option records in a single transaction.
func (s *Store) CreatePoll(ctx context.Context, p CreatePollParams) (*ent.Poll, []*ent.PollOption, error) {
	var createdPoll *ent.Poll
	var createdOptions []*ent.PollOption

	err := s.WithTx(ctx, func(tx *ent.Tx) error {
		pollCreate := tx.Poll.Create().
			SetID(p.ID).
			SetChatID(p.ChatID).
			SetMessageID(p.MessageID).
			SetQuestion(p.Question).
			SetIsAnonymous(p.IsAnonymous).
			SetAllowMultiple(p.AllowMultiple).
			SetIsQuiz(p.IsQuiz).
			SetCreatedAt(p.CreatedAt)

		if p.CorrectOptionID != nil {
			pollCreate.SetCorrectOptionID(*p.CorrectOptionID)
		}
		if p.Explanation != nil {
			pollCreate.SetExplanation(*p.Explanation)
		}

		pollObj, err := pollCreate.Save(ctx)
		if err != nil {
			return err
		}
		createdPoll = pollObj

		opts := make([]*ent.PollOption, 0, len(p.Options))
		for i, text := range p.Options {
			optObj, err := tx.PollOption.Create().
				SetID(p.ID + "-opt-" + string(rune('0'+i))).
				SetPollID(p.ID).
				SetText(text).
				SetOptionIndex(i).
				Save(ctx)
			if err != nil {
				return err
			}
			opts = append(opts, optObj)
		}
		createdOptions = opts

		// If quiz mode was selected and correct option index was mapped to option ID after option creation
		if p.IsQuiz && p.CorrectOptionID != nil && *p.CorrectOptionID != "" {
			// If correctOptionId was supplied as an index key like "idx:0", resolve to option ID
			if len(*p.CorrectOptionID) >= 4 && (*p.CorrectOptionID)[:4] == "idx:" {
				idx := int((*p.CorrectOptionID)[4] - '0')
				if idx >= 0 && idx < len(opts) {
					realOptID := opts[idx].ID
					_, err = tx.Poll.UpdateOneID(pollObj.ID).SetCorrectOptionID(realOptID).Save(ctx)
					if err != nil {
						return err
					}
					createdPoll.CorrectOptionID = &realOptID
				}
			}
		}

		return nil
	})

	if err != nil {
		return nil, nil, err
	}
	return createdPoll, createdOptions, nil
}

func (s *Store) GetPollByMessageID(ctx context.Context, messageID string) (*ent.Poll, error) {
	return s.Client.Poll.Query().Where(poll.MessageIDEQ(messageID)).Only(ctx)
}

func (s *Store) GetPollByID(ctx context.Context, pollID string) (*ent.Poll, error) {
	return s.Client.Poll.Query().Where(poll.IDEQ(pollID)).Only(ctx)
}

func (s *Store) ListPollOptions(ctx context.Context, pollID string) ([]*ent.PollOption, error) {
	return s.Client.PollOption.Query().Where(polloption.PollIDEQ(pollID)).Order(ent.Asc(polloption.FieldOptionIndex)).All(ctx)
}

func (s *Store) ListPollVotes(ctx context.Context, pollID string) ([]*ent.PollVote, error) {
	return s.Client.PollVote.Query().Where(pollvote.PollIDEQ(pollID)).All(ctx)
}

// CastPollVotes clears previous votes for the user on this poll and sets the new option votes.
func (s *Store) CastPollVotes(ctx context.Context, pollID, userID string, optionIDs []string, createdAt string) error {
	return s.WithTx(ctx, func(tx *ent.Tx) error {
		// Delete previous votes for this user on this poll
		_, err := tx.PollVote.Delete().
			Where(
				pollvote.PollIDEQ(pollID),
				pollvote.UserIDEQ(userID),
			).
			Exec(ctx)
		if err != nil {
			return err
		}

		// Insert new votes
		for _, optID := range optionIDs {
			_, err := tx.PollVote.Create().
				SetID(pollID + "-" + userID + "-" + optID).
				SetPollID(pollID).
				SetOptionID(optID).
				SetUserID(userID).
				SetCreatedAt(createdAt).
				Save(ctx)
			if err != nil {
				return err
			}
		}
		return nil
	})
}

// ClosePoll updates poll to closed.
func (s *Store) ClosePoll(ctx context.Context, pollID, closedAt string) (*ent.Poll, error) {
	return s.Client.Poll.UpdateOneID(pollID).
		SetIsClosed(true).
		SetClosedAt(closedAt).
		Save(ctx)
}
