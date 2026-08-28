package repository

import (
	"context"
	"time"

	"stovo-messenger/backend/ent"
	"stovo-messenger/backend/ent/callparticipant"
	"stovo-messenger/backend/ent/callsession"
)

// CreateCallSessionParams holds fields for inserting a call session.
type CreateCallSessionParams struct {
	ID        string
	ChatID    string
	CallerID  string
	CalleeID  string
	CallType  string
	Topology  string
	State     string
	CreatedAt time.Time
}

// CreateCallSession inserts a call session row (ON CONFLICT id DO NOTHING).
func (s *Store) CreateCallSession(ctx context.Context, p CreateCallSessionParams) error {
	create := s.Client.CallSession.Create().
		SetID(p.ID).
		SetCallerID(p.CallerID).
		SetCalleeID(p.CalleeID).
		SetCallType(p.CallType).
		SetTopology(p.Topology).
		SetState(p.State).
		SetCreatedAt(p.CreatedAt)
	if p.ChatID != "" {
		create.SetChatID(p.ChatID)
	}
	return create.
		OnConflictColumns(callsession.FieldID).
		DoNothing().
		Exec(ctx)
}

// UpdateCallSessionState sets the state of a call session.
func (s *Store) UpdateCallSessionState(ctx context.Context, id, state string) error {
	_, err := s.Client.CallSession.UpdateOneID(id).SetState(state).Save(ctx)
	return err
}

// UpdateCallSessionTopology sets the topology of a call session.
func (s *Store) UpdateCallSessionTopology(ctx context.Context, id, topology string) error {
	_, err := s.Client.CallSession.UpdateOneID(id).SetTopology(topology).Save(ctx)
	return err
}

// EndCallSession marks a call session as ended with duration and ended_at.
func (s *Store) EndCallSession(ctx context.Context, id string, durationS int, endedAt time.Time) error {
	_, err := s.Client.CallSession.UpdateOneID(id).
		SetState("ended").
		SetEndedAt(endedAt).
		SetDurationS(durationS).
		Save(ctx)
	return err
}

// UpsertCallParticipantParams holds fields for upserting a call participant.
type UpsertCallParticipantParams struct {
	RoomID   string
	UserID   string
	Role     string
	State    string
	JoinedAt *time.Time
}

// UpsertCallParticipant inserts or updates a participant (joined_at updated only when non-nil).
func (s *Store) UpsertCallParticipant(ctx context.Context, p UpsertCallParticipantParams) error {
	create := s.Client.CallParticipant.Create().
		SetID(p.RoomID).
		SetUserID(p.UserID).
		SetRole(p.Role).
		SetState(p.State)
	if p.JoinedAt != nil {
		create.SetJoinedAt(*p.JoinedAt)
	}
	upsert := create.OnConflictColumns(callparticipant.FieldID, callparticipant.FieldUserID)
	if p.JoinedAt != nil {
		return upsert.Update(func(u *ent.CallParticipantUpsert) {
			u.UpdateRole()
			u.UpdateState()
			u.UpdateJoinedAt()
		}).Exec(ctx)
	}
	return upsert.Update(func(u *ent.CallParticipantUpsert) {
		u.UpdateRole()
		u.UpdateState()
	}).Exec(ctx)
}

// ListActiveCallSessions returns non-ended sessions created within lookback.
func (s *Store) ListActiveCallSessions(ctx context.Context, lookback time.Duration) ([]*ent.CallSession, error) {
	cutoff := time.Now().Add(-lookback)
	return s.Client.CallSession.Query().
		Where(
			callsession.EndedAtIsNil(),
			callsession.CreatedAtGT(cutoff),
		).
		All(ctx)
}

// ListCallParticipants returns participants for a call room.
func (s *Store) ListCallParticipants(ctx context.Context, roomID string) ([]*ent.CallParticipant, error) {
	return s.Client.CallParticipant.Query().
		Where(callparticipant.IDEQ(roomID)).
		All(ctx)
}

// RecordCallHistoryParams holds fields for recording a call history message.
type RecordCallHistoryParams struct {
	MessageID          string
	ChatID             string
	SenderID           string
	EncryptionMetadata string
	CreatedAt          string
	UpdatedAt          string
}

// RecordCallHistory inserts a call message, sent status, and bumps chat updated_at.
func (s *Store) RecordCallHistory(ctx context.Context, p RecordCallHistoryParams) error {
	return s.WithTx(ctx, func(tx *ent.Tx) error {
		if _, err := tx.Message.Create().
			SetID(p.MessageID).
			SetChatID(p.ChatID).
			SetSenderID(p.SenderID).
			SetType("call").
			SetEncryptionProtocol("legacy_plaintext").
			SetEncryptionMetadata(p.EncryptionMetadata).
			SetMessageKind("chat").
			SetCreatedAt(p.CreatedAt).
			SetUpdatedAt(p.UpdatedAt).
			Save(ctx); err != nil {
			return err
		}
		if _, err := tx.MessageStatus.Create().
			SetID(p.MessageID).
			SetUserID(p.SenderID).
			SetStatus("sent").
			SetCreatedAt(p.CreatedAt).
			Save(ctx); err != nil {
			return err
		}
		_, err := tx.Chat.UpdateOneID(p.ChatID).SetUpdatedAt(p.UpdatedAt).Save(ctx)
		return err
	})
}
