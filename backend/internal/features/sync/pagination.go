// Package sync owns device synchronization queries and their opaque cursors.
package sync

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"
)

const (
	defaultPageSize = 100
	maxPageSize     = 500
)

var (
	ErrInvalidCursor = errors.New("invalid sync cursor")
	ErrInvalidLimit  = errors.New("invalid sync limit")
)

type Actor struct {
	FamilyID string
	UserID   string
}

type Event struct {
	Sequence      int64
	ID            string
	Type          string
	Version       int
	AggregateType string
	AggregateID   string
	Payload       []byte
	OccurredAt    time.Time
}

type Page struct {
	Events     []Event
	NextCursor string
	HasMore    bool
}

// Store is defined by its sync-query consumer, rather than a shared
// repository. It returns only feature values, never SQL rows or Ent models.
type Store interface {
	List(context.Context, Actor, int64, int) ([]Event, error)
	HighWater(context.Context, string) (int64, error)
}

type Service struct {
	store      Store
	signingKey []byte
}

func NewService(store Store, signingKey string) *Service {
	return &Service{store: store, signingKey: []byte(signingKey)}
}

// Page parses the opaque transport values, applies audience filtering through
// the store, and returns an equally opaque next cursor.
func (s *Service) Page(ctx context.Context, actor Actor, rawCursor, rawLimit string) (Page, error) {
	cursor, err := s.parseCursor(rawCursor, actor)
	if err != nil {
		return Page{}, err
	}
	limit, err := parseLimit(rawLimit)
	if err != nil {
		return Page{}, err
	}
	events, err := s.store.List(ctx, actor, cursor, limit+1)
	if err != nil {
		return Page{}, err
	}
	page := Page{Events: events}
	if len(page.Events) > limit {
		page.HasMore = true
		page.Events = page.Events[:limit]
	}
	if len(page.Events) > 0 {
		page.NextCursor = s.encodeCursor(actor, page.Events[len(page.Events)-1].Sequence)
		return page, nil
	}
	if strings.TrimSpace(rawCursor) != "" {
		page.NextCursor = strings.TrimSpace(rawCursor)
		return page, nil
	}
	sequence, err := s.store.HighWater(ctx, actor.FamilyID)
	if err != nil {
		return Page{}, err
	}
	page.NextCursor = s.encodeCursor(actor, sequence)
	return page, nil
}

func parseLimit(raw string) (int, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return defaultPageSize, nil
	}
	value, err := strconv.Atoi(raw)
	if err != nil || value < 1 || value > maxPageSize {
		return 0, ErrInvalidLimit
	}
	return value, nil
}

func (s *Service) parseCursor(raw string, actor Actor) (int64, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return 0, nil
	}
	parts := strings.Split(raw, ".")
	if len(parts) != 2 {
		return 0, ErrInvalidCursor
	}
	payload, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return 0, ErrInvalidCursor
	}
	mac := hmac.New(sha256.New, s.signingKey)
	_, _ = mac.Write(payload)
	if !hmac.Equal([]byte(hex.EncodeToString(mac.Sum(nil))), []byte(parts[1])) {
		return 0, ErrInvalidCursor
	}
	fields := strings.Split(string(payload), "\n")
	if len(fields) != 3 || fields[0] != actor.FamilyID || fields[1] != actor.UserID {
		return 0, ErrInvalidCursor
	}
	sequence, err := strconv.ParseInt(fields[2], 10, 64)
	if err != nil || sequence < 0 {
		return 0, ErrInvalidCursor
	}
	return sequence, nil
}

func (s *Service) encodeCursor(actor Actor, sequence int64) string {
	payload := []byte(fmt.Sprintf("%s\n%s\n%d", actor.FamilyID, actor.UserID, sequence))
	mac := hmac.New(sha256.New, s.signingKey)
	_, _ = mac.Write(payload)
	return base64.RawURLEncoding.EncodeToString(payload) + "." + hex.EncodeToString(mac.Sum(nil))
}
