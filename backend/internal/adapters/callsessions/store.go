// Package callsessions provides the Ent implementation of call lifecycle
// persistence for the calls feature.
package callsessions

import (
	"context"
	"time"

	featurecalls "stovo-messenger/backend/internal/features/calls"
	"stovo-messenger/backend/internal/repository"
)

type Store struct{ repository *repository.Store }

func NewStore(repository *repository.Store) *Store { return &Store{repository: repository} }

func (s *Store) CreateSession(ctx context.Context, session featurecalls.Session) error {
	return s.repository.CreateCallSession(ctx, repository.CreateCallSessionParams{ID: session.ID, ChatID: session.ChatID, CallerID: session.CallerID, CalleeID: session.CalleeID, CallType: session.CallType, Topology: session.Topology, State: session.State, CreatedAt: session.CreatedAt})
}
func (s *Store) UpdateSessionState(ctx context.Context, id, state string) error {
	return s.repository.UpdateCallSessionState(ctx, id, state)
}
func (s *Store) UpdateSessionTopology(ctx context.Context, id, topology string) error {
	return s.repository.UpdateCallSessionTopology(ctx, id, topology)
}
func (s *Store) EndSession(ctx context.Context, id string, duration int, endedAt time.Time) error {
	return s.repository.EndCallSession(ctx, id, duration, endedAt)
}
func (s *Store) UpsertParticipant(ctx context.Context, participant featurecalls.Participant) error {
	return s.repository.UpsertCallParticipant(ctx, repository.UpsertCallParticipantParams{RoomID: participant.RoomID, UserID: participant.UserID, Role: participant.Role, State: participant.State, JoinedAt: participant.JoinedAt})
}
func (s *Store) ActiveSessions(ctx context.Context, lookback time.Duration) ([]featurecalls.Session, error) {
	rows, err := s.repository.ListActiveCallSessions(ctx, lookback)
	if err != nil {
		return nil, err
	}
	result := make([]featurecalls.Session, 0, len(rows))
	for _, row := range rows {
		chatID := ""
		if row.ChatID != nil {
			chatID = *row.ChatID
		}
		result = append(result, featurecalls.Session{ID: row.ID, ChatID: chatID, CallerID: row.CallerID, CalleeID: row.CalleeID, CallType: row.CallType, Topology: row.Topology, State: row.State, CreatedAt: row.CreatedAt.UTC()})
	}
	return result, nil
}
func (s *Store) Participants(ctx context.Context, roomID string) ([]featurecalls.Participant, error) {
	rows, err := s.repository.ListCallParticipants(ctx, roomID)
	if err != nil {
		return nil, err
	}
	result := make([]featurecalls.Participant, 0, len(rows))
	for _, row := range rows {
		var joinedAt *time.Time
		if row.JoinedAt != nil {
			value := row.JoinedAt.UTC()
			joinedAt = &value
		}
		result = append(result, featurecalls.Participant{RoomID: roomID, UserID: row.UserID, Role: row.Role, State: row.State, JoinedAt: joinedAt})
	}
	return result, nil
}
func (s *Store) RecordHistory(ctx context.Context, record featurecalls.HistoryRecord) error {
	return s.repository.RecordCallHistory(ctx, repository.RecordCallHistoryParams{MessageID: record.MessageID, ChatID: record.ChatID, SenderID: record.SenderID, EncryptionMetadata: record.EncryptionMetadata, CreatedAt: record.CreatedAt, UpdatedAt: record.UpdatedAt})
}
