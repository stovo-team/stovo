package messages

import "context"

// SearchHit is the persistence-neutral identity of a plaintext message match.
type SearchHit struct {
	ID     string
	ChatID string
}

// EncryptedSearchCandidate carries only the encrypted material required for
// outer-layer decryption when searching server-at-rest encrypted messages.
type EncryptedSearchCandidate struct {
	ID, ChatID, Ciphertext, Nonce, FamilyID string
}

// SearchStore is owned by the messages feature. Implementations may use any
// persistence technology, but no persistence model crosses this boundary.
type SearchStore interface {
	SearchPlaintext(context.Context, []string, string, int) ([]SearchHit, error)
	EncryptedCandidates(context.Context, []string, string, int) ([]EncryptedSearchCandidate, error)
}

type SearchService struct{ store SearchStore }

func NewSearchService(store SearchStore) *SearchService { return &SearchService{store: store} }

func (s *SearchService) Plaintext(ctx context.Context, chatIDs []string, query string, limit int) ([]SearchHit, error) {
	return s.store.SearchPlaintext(ctx, chatIDs, query, limit)
}

func (s *SearchService) EncryptedCandidates(ctx context.Context, chatIDs []string, protocol string, limit int) ([]EncryptedSearchCandidate, error) {
	return s.store.EncryptedCandidates(ctx, chatIDs, protocol, limit)
}
