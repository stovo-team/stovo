package messages

import (
	"context"
	"errors"
	"testing"
)

type searchStoreFake struct {
	hits       []SearchHit
	candidates []EncryptedSearchCandidate
	err        error
}

func (s *searchStoreFake) SearchPlaintext(context.Context, []string, string, int) ([]SearchHit, error) {
	return s.hits, s.err
}

func (s *searchStoreFake) EncryptedCandidates(context.Context, []string, string, int) ([]EncryptedSearchCandidate, error) {
	return s.candidates, s.err
}

func TestSearchServiceDelegatesQueries(t *testing.T) {
	store := &searchStoreFake{hits: []SearchHit{{ID: "message-1"}}, candidates: []EncryptedSearchCandidate{{ID: "message-2"}}}
	service := NewSearchService(store)
	hits, err := service.Plaintext(context.Background(), []string{"chat"}, "hello", 10)
	if err != nil || len(hits) != 1 || hits[0].ID != "message-1" {
		t.Fatalf("hits=%v err=%v", hits, err)
	}
	candidates, err := service.EncryptedCandidates(context.Background(), []string{"chat"}, "server-at-rest", 10)
	if err != nil || len(candidates) != 1 || candidates[0].ID != "message-2" {
		t.Fatalf("candidates=%v err=%v", candidates, err)
	}
	store.err = errors.New("read failed")
	if _, err := service.Plaintext(context.Background(), nil, "hello", 1); !errors.Is(err, store.err) {
		t.Fatalf("err=%v", err)
	}
}
