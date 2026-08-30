package messagesearch

import (
	"context"

	featuremessages "stovo-messenger/backend/internal/features/messages"
	"stovo-messenger/backend/internal/repository"
)

type Store struct{ repository *repository.Store }

func NewStore(repository *repository.Store) *Store { return &Store{repository: repository} }

func (s *Store) SearchPlaintext(ctx context.Context, chatIDs []string, query string, limit int) ([]featuremessages.SearchHit, error) {
	hits, err := s.repository.SearchPlaintextMessages(ctx, chatIDs, query, limit)
	if err != nil {
		return nil, err
	}
	out := make([]featuremessages.SearchHit, 0, len(hits))
	for _, hit := range hits {
		out = append(out, featuremessages.SearchHit{ID: hit.ID, ChatID: hit.ChatID})
	}
	return out, nil
}

func (s *Store) EncryptedCandidates(ctx context.Context, chatIDs []string, protocol string, limit int) ([]featuremessages.EncryptedSearchCandidate, error) {
	candidates, err := s.repository.ListEncryptedMessageCandidates(ctx, chatIDs, protocol, limit)
	if err != nil {
		return nil, err
	}
	out := make([]featuremessages.EncryptedSearchCandidate, 0, len(candidates))
	for _, candidate := range candidates {
		out = append(out, featuremessages.EncryptedSearchCandidate{
			ID: candidate.ID, ChatID: candidate.ChatID, Ciphertext: candidate.Ciphertext,
			Nonce: candidate.Nonce, FamilyID: candidate.FamilyID,
		})
	}
	return out, nil
}

var _ featuremessages.SearchStore = (*Store)(nil)
