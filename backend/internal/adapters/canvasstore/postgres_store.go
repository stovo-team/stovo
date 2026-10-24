package canvasstore

import (
	"context"
	"database/sql"
	"errors"
	"time"
)

var ErrOwnershipConflict = errors.New("canvas already exists with different ownership")

type Store struct{ db *sql.DB }

func NewPostgresStore(db *sql.DB) *Store { return &Store{db: db} }

type Canvas struct {
	ID, FamilyID, OriginChatID, CreatedBy, Title string
	LinkedChatIDs []string
	CreatedAt, UpdatedAt time.Time
}

type Card struct { ID, Title string; Available bool }

type Update struct {
	Sequence int64
	Ciphertext, Nonce, CreatedBy, FamilyID string
	CreatedAt time.Time
}

type CreateInput struct { ID, FamilyID, ChatID, UserID, Title, InitialCiphertext, InitialNonce string }

func (s *Store) Create(ctx context.Context, in CreateInput) (bool, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil { return false, err }
	defer func() { _ = tx.Rollback() }()
	result, err := tx.ExecContext(ctx, `INSERT INTO canvases (id,family_id,origin_chat_id,created_by,title) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO NOTHING`, in.ID, in.FamilyID, in.ChatID, in.UserID, in.Title)
	if err != nil { return false, err }
	inserted, err := result.RowsAffected()
	if err != nil { return false, err }
	if inserted == 0 {
		var familyID, originChatID, createdBy string
		var deletedAt sql.NullTime
		if err := tx.QueryRowContext(ctx, `SELECT family_id,origin_chat_id,created_by,deleted_at FROM canvases WHERE id=$1`, in.ID).Scan(&familyID, &originChatID, &createdBy, &deletedAt); err != nil { return false, err }
		if familyID != in.FamilyID || createdBy != in.UserID || originChatID != in.ChatID || deletedAt.Valid { return false, ErrOwnershipConflict }
	} else {
		if _, err := tx.ExecContext(ctx, `INSERT INTO canvas_chat_links (canvas_id,chat_id,created_by) VALUES ($1,$2,$3)`, in.ID, in.ChatID, in.UserID); err != nil { return false, err }
		if in.InitialCiphertext != "" { if _, err := tx.ExecContext(ctx, `INSERT INTO canvas_updates (canvas_id,ciphertext,nonce,created_by) VALUES ($1,$2,$3,$4)`, in.ID, in.InitialCiphertext, in.InitialNonce, in.UserID); err != nil { return false, err } }
	}
	if err := tx.Commit(); err != nil { return false, err }
	return inserted == 1, nil
}

func (s *Store) CanvasCardExists(ctx context.Context, canvasID, chatID string) (bool, error) {
	var exists bool
	err := s.db.QueryRowContext(ctx, `SELECT card_message_id IS NOT NULL FROM canvas_chat_links WHERE canvas_id=$1 AND chat_id=$2`, canvasID, chatID).Scan(&exists)
	return exists, err
}

func (s *Store) CreateCard(ctx context.Context, messageID, canvasID, chatID string) error {
	if _, err := s.db.ExecContext(ctx, `INSERT INTO canvas_cards (message_id,canvas_id) VALUES ($1,$2) ON CONFLICT (message_id) DO NOTHING`, messageID, canvasID); err != nil { return err }
	_, err := s.db.ExecContext(ctx, `UPDATE canvas_chat_links SET card_message_id=$3 WHERE canvas_id=$1 AND chat_id=$2`, canvasID, chatID, messageID)
	return err
}

func (s *Store) Get(ctx context.Context, canvasID, familyID, userID string) (Canvas, error) {
	var canvas Canvas
	err := s.db.QueryRowContext(ctx, `
		SELECT c.id,c.family_id,c.origin_chat_id,c.created_by,c.title,c.created_at,c.updated_at
		FROM canvases c WHERE c.id=$1 AND c.family_id=$2 AND c.deleted_at IS NULL
		AND (c.created_by=$3 OR EXISTS (SELECT 1 FROM canvas_chat_links l JOIN chat_members cm ON cm.chat_id=l.chat_id WHERE l.canvas_id=c.id AND l.deleted_at IS NULL AND cm.user_id=$3))`, canvasID, familyID, userID).
		Scan(&canvas.ID, &canvas.FamilyID, &canvas.OriginChatID, &canvas.CreatedBy, &canvas.Title, &canvas.CreatedAt, &canvas.UpdatedAt)
	if err != nil { return Canvas{}, err }
	rows, err := s.db.QueryContext(ctx, `SELECT chat_id FROM canvas_chat_links WHERE canvas_id=$1 AND deleted_at IS NULL ORDER BY created_at`, canvas.ID)
	if err != nil { return Canvas{}, err }
	defer func() { _ = rows.Close() }()
	for rows.Next() { var chatID string; if err := rows.Scan(&chatID); err != nil { return Canvas{}, err }; canvas.LinkedChatIDs = append(canvas.LinkedChatIDs, chatID) }
	return canvas, rows.Err()
}

func (s *Store) ListChatCanvasIDs(ctx context.Context, chatID string) ([]string, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT canvas_id FROM canvas_chat_links WHERE chat_id=$1 AND deleted_at IS NULL ORDER BY created_at DESC`, chatID)
	if err != nil { return nil, err }
	defer func() { _ = rows.Close() }()
	return scanStrings(rows)
}

func (s *Store) ListFamilyCanvasIDs(ctx context.Context, familyID, userID string) ([]string, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT c.id FROM canvases c WHERE c.family_id=$1 AND c.deleted_at IS NULL
		AND (c.created_by=$2 OR EXISTS (SELECT 1 FROM canvas_chat_links l JOIN chat_members cm ON cm.chat_id=l.chat_id WHERE l.canvas_id=c.id AND l.deleted_at IS NULL AND cm.user_id=$2))
		ORDER BY c.updated_at DESC`, familyID, userID)
	if err != nil { return nil, err }
	defer func() { _ = rows.Close() }()
	return scanStrings(rows)
}

func scanStrings(rows *sql.Rows) ([]string, error) {
	values := []string{}
	for rows.Next() { var value string; if err := rows.Scan(&value); err != nil { return nil, err }; values = append(values, value) }
	return values, rows.Err()
}

func (s *Store) Rename(ctx context.Context, canvasID, title string) error {
	_, err := s.db.ExecContext(ctx, `UPDATE canvases SET title=$2,updated_at=now() WHERE id=$1`, canvasID, title)
	return err
}

func (s *Store) Delete(ctx context.Context, canvasID string) error {
	_, err := s.db.ExecContext(ctx, `UPDATE canvases SET deleted_at=now(),updated_at=now() WHERE id=$1`, canvasID)
	return err
}

func (s *Store) HasActiveLink(ctx context.Context, canvasID, chatID string) (bool, error) {
	var active bool
	err := s.db.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM canvas_chat_links WHERE canvas_id=$1 AND chat_id=$2 AND deleted_at IS NULL)`, canvasID, chatID).Scan(&active)
	return active, err
}

func (s *Store) Link(ctx context.Context, canvasID, chatID, userID string) error {
	_, err := s.db.ExecContext(ctx, `INSERT INTO canvas_chat_links (canvas_id,chat_id,created_by,deleted_at) VALUES ($1,$2,$3,NULL) ON CONFLICT (canvas_id,chat_id) DO UPDATE SET deleted_at=NULL,created_by=EXCLUDED.created_by,card_message_id=NULL,created_at=now()`, canvasID, chatID, userID)
	return err
}

func (s *Store) Unlink(ctx context.Context, canvasID, chatID string) (int64, error) {
	result, err := s.db.ExecContext(ctx, `UPDATE canvas_chat_links SET deleted_at=now() WHERE canvas_id=$1 AND chat_id=$2 AND deleted_at IS NULL`, canvasID, chatID)
	if err != nil { return 0, err }
	return result.RowsAffected()
}

func (s *Store) CardForMessage(ctx context.Context, messageID, viewerID string) (Card, error) {
	var card Card
	err := s.db.QueryRowContext(ctx, `SELECT c.id,c.title,EXISTS(SELECT 1 FROM canvas_chat_links l JOIN chat_members cm ON cm.chat_id=l.chat_id WHERE l.canvas_id=c.id AND l.deleted_at IS NULL AND cm.user_id=$2) FROM canvas_cards cc JOIN canvases c ON c.id=cc.canvas_id WHERE cc.message_id=$1`, messageID, viewerID).Scan(&card.ID, &card.Title, &card.Available)
	return card, err
}

func (s *Store) Updates(ctx context.Context, canvasID string) ([]Update, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT u.sequence,u.ciphertext,u.nonce,u.created_by,u.created_at,c.family_id FROM canvas_updates u JOIN canvases c ON c.id=u.canvas_id WHERE u.canvas_id=$1 ORDER BY u.sequence`, canvasID)
	if err != nil { return nil, err }
	defer func() { _ = rows.Close() }()
	updates := []Update{}
	for rows.Next() { var item Update; if err := rows.Scan(&item.Sequence, &item.Ciphertext, &item.Nonce, &item.CreatedBy, &item.CreatedAt, &item.FamilyID); err != nil { return nil, err }; updates = append(updates, item) }
	return updates, rows.Err()
}

func (s *Store) SaveUpdate(ctx context.Context, canvasID, ciphertext, nonce, userID string) (int64, time.Time, error) {
	var sequence int64
	var createdAt time.Time
	err := s.db.QueryRowContext(ctx, `INSERT INTO canvas_updates (canvas_id,ciphertext,nonce,created_by) VALUES ($1,$2,$3,$4) RETURNING sequence,created_at`, canvasID, ciphertext, nonce, userID).Scan(&sequence, &createdAt)
	if err != nil { return 0, time.Time{}, err }
	_, _ = s.db.ExecContext(ctx, `UPDATE canvases SET updated_at=now() WHERE id=$1`, canvasID)
	return sequence, createdAt, nil
}

func (s *Store) Audience(ctx context.Context, canvasID string) ([]string, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT DISTINCT cm.user_id FROM canvas_chat_links l JOIN chat_members cm ON cm.chat_id=l.chat_id WHERE l.canvas_id=$1 AND l.deleted_at IS NULL`, canvasID)
	if err != nil { return nil, err }
	defer func() { _ = rows.Close() }()
	return scanStrings(rows)
}
