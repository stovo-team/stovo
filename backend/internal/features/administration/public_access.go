// Package administration contains feature use cases for operational family
// settings. Transport handlers remain responsible for HTTP and tunnel details.
package administration

import (
	"context"
	"errors"
	"strings"
	"time"
)

const (
	EncryptionProtocolEndToEnd     = "end_to_end"
	EncryptionProtocolServerAtRest = "server_at_rest"
)

var ErrUnsupportedEncryptionProtocol = errors.New("unsupported encryption protocol")

type PublicURLs struct {
	AppURL *string
	APIURL *string
}

// PublicAccessStore is intentionally owned by the administration consumer.
// It prevents HTTP handlers from depending on repository or Ent types.
type PublicAccessStore interface {
	SavePublicURLs(context.Context, string, PublicURLs) error
}

type PublicAccessService struct {
	store PublicAccessStore
}

func NewPublicAccessService(store PublicAccessStore) *PublicAccessService {
	return &PublicAccessService{store: store}
}

func (s *PublicAccessService) Save(ctx context.Context, familyID string, urls PublicURLs) error {
	return s.store.SavePublicURLs(ctx, familyID, urls)
}

type EncryptionStore interface {
	SaveEncryptionProtocol(context.Context, string, string, string) error
}

type EncryptionService struct {
	store EncryptionStore
	now   func() time.Time
}

func NewEncryptionService(store EncryptionStore, now func() time.Time) *EncryptionService {
	if now == nil {
		now = time.Now
	}
	return &EncryptionService{store: store, now: now}
}

func NormalizeEncryptionProtocol(value string) (string, error) {
	switch strings.TrimSpace(value) {
	case "", EncryptionProtocolServerAtRest:
		return EncryptionProtocolServerAtRest, nil
	case EncryptionProtocolEndToEnd:
		return EncryptionProtocolEndToEnd, nil
	default:
		return "", ErrUnsupportedEncryptionProtocol
	}
}

func (s *EncryptionService) Set(ctx context.Context, familyID, value string) (string, error) {
	protocol, err := NormalizeEncryptionProtocol(value)
	if err != nil {
		return "", err
	}
	if err := s.store.SaveEncryptionProtocol(ctx, familyID, protocol, s.now().UTC().Format(time.RFC3339Nano)); err != nil {
		return "", err
	}
	return protocol, nil
}
