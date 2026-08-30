package administration

import (
	"context"
	"errors"
	"testing"
	"time"
)

type publicAccessStoreFake struct {
	familyID string
	urls     PublicURLs
}

type encryptionStoreFake struct{ protocol, updatedAt string }

func (s *encryptionStoreFake) SaveEncryptionProtocol(_ context.Context, _, protocol, updatedAt string) error {
	s.protocol, s.updatedAt = protocol, updatedAt
	return nil
}

func TestEncryptionServiceNormalizesAndPersistsProtocol(t *testing.T) {
	store := &encryptionStoreFake{}
	now := time.Date(2026, 8, 30, 8, 0, 0, 0, time.UTC)
	service := NewEncryptionService(store, func() time.Time { return now })
	protocol, err := service.Set(context.Background(), "family", "")
	if err != nil || protocol != EncryptionProtocolServerAtRest || store.protocol != protocol || store.updatedAt != now.Format(time.RFC3339Nano) {
		t.Fatalf("protocol=%q stored=%q at=%q err=%v", protocol, store.protocol, store.updatedAt, err)
	}
	_, err = service.Set(context.Background(), "family", "legacy_plaintext")
	if !errors.Is(err, ErrUnsupportedEncryptionProtocol) {
		t.Fatalf("err=%v", err)
	}
}

func (s *publicAccessStoreFake) SavePublicURLs(_ context.Context, familyID string, urls PublicURLs) error {
	s.familyID, s.urls = familyID, urls
	return nil
}

func TestPublicAccessServicePassesPersistenceNeutralURLs(t *testing.T) {
	store := &publicAccessStoreFake{}
	service := NewPublicAccessService(store)
	appURL, apiURL := "https://app.example", "https://api.example"
	if err := service.Save(context.Background(), "family-1", PublicURLs{AppURL: &appURL, APIURL: &apiURL}); err != nil {
		t.Fatal(err)
	}
	if store.familyID != "family-1" || store.urls.AppURL != &appURL || store.urls.APIURL != &apiURL {
		t.Fatalf("stored=%+v family=%q", store.urls, store.familyID)
	}
}
