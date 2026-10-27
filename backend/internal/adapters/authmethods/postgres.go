package authmethods

import (
	"context"
	"database/sql"
	"time"

	"stovo-messenger/backend/internal/features/identity"
)

type PostgresStore struct{ db *sql.DB }

func NewPostgresStore(db *sql.DB) *PostgresStore { return &PostgresStore{db: db} }

func (s *PostgresStore) ListPasskeyCredentials(ctx context.Context, userID, familyID string) ([][]byte, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT credential_data FROM passkey_credentials WHERE user_id = $1 AND family_id = $2 AND revoked_at IS NULL`, userID, familyID)
	if err != nil { return nil, err }
	defer func() { _ = rows.Close() }()
	values := make([][]byte, 0)
	for rows.Next() { var value []byte; if err := rows.Scan(&value); err != nil { return nil, err }; values = append(values, value) }
	return values, rows.Err()
}

func (s *PostgresStore) SavePasskeyCeremony(ctx context.Context, idHash, purpose, familyID, userID, inviteHash string, session []byte, expiresAt time.Time) error {
	_, err := s.db.ExecContext(ctx, `INSERT INTO passkey_ceremonies (id_hash, purpose, family_id, user_id, invite_token_hash, session_data, expires_at) VALUES ($1, $2, NULLIF($3, ''), NULLIF($4, ''), NULLIF($5, ''), $6, $7)`, idHash, purpose, familyID, userID, inviteHash, session, expiresAt)
	return err
}

func (s *PostgresStore) ConsumePasskeyCeremony(ctx context.Context, idHash, purpose string) (identity.AuthMethodCeremony, error) {
	var result identity.AuthMethodCeremony
	var familyID, userID, inviteHash sql.NullString
	err := s.db.QueryRowContext(ctx, `UPDATE passkey_ceremonies SET consumed_at = now() WHERE id_hash = $1 AND purpose = $2 AND consumed_at IS NULL AND expires_at > now() RETURNING family_id, user_id, invite_token_hash, session_data`, idHash, purpose).Scan(&familyID, &userID, &inviteHash, &result.SessionData)
	result.FamilyID, result.UserID, result.InviteTokenHash = familyID.String, userID.String, inviteHash.String
	return result, err
}

func (s *PostgresStore) SavePasskeyCredential(ctx context.Context, id, userID, familyID, credentialID string, data []byte) error {
	_, err := s.db.ExecContext(ctx, `INSERT INTO passkey_credentials (id, user_id, family_id, credential_id, credential_data) VALUES ($1, $2, $3, $4, $5)`, id, userID, familyID, credentialID, data)
	return err
}

func (s *PostgresStore) PasskeyOwner(ctx context.Context, credentialID string) (string, error) {
	var userID string
	err := s.db.QueryRowContext(ctx, `SELECT user_id FROM passkey_credentials WHERE credential_id = $1 AND revoked_at IS NULL`, credentialID).Scan(&userID)
	return userID, err
}

func (s *PostgresStore) UpdatePasskeyCredential(ctx context.Context, credentialID string, data []byte) error {
	_, err := s.db.ExecContext(ctx, `UPDATE passkey_credentials SET credential_data = $1, last_used_at = now() WHERE credential_id = $2 AND revoked_at IS NULL`, data, credentialID)
	return err
}

func (s *PostgresStore) CleanupExpiredAuthRequests(ctx context.Context) error {
	if _, err := s.db.ExecContext(ctx, `DELETE FROM passkey_ceremonies WHERE expires_at < now() - interval '1 day'`); err != nil { return err }
	if _, err := s.db.ExecContext(ctx, `DELETE FROM android_qr_login_grants WHERE expires_at < now() - interval '1 day'`); err != nil { return err }
	_, err := s.db.ExecContext(ctx, `DELETE FROM qr_login_requests WHERE expires_at < now() - interval '1 day'`)
	return err
}

func (s *PostgresStore) CreateQRLogin(ctx context.Context, requestHash, ip string, expiresAt time.Time) error {
	_, err := s.db.ExecContext(ctx, `INSERT INTO qr_login_requests (request_hash, status, browser_ip, expires_at) VALUES ($1, 'pending', $2, $3)`, requestHash, ip, expiresAt)
	return err
}

func (s *PostgresStore) QRLogin(ctx context.Context, requestHash string) (identity.QRLoginRecord, error) {
	var result identity.QRLoginRecord
	var userID sql.NullString
	err := s.db.QueryRowContext(ctx, `SELECT status, approved_user_id, expires_at FROM qr_login_requests WHERE request_hash = $1`, requestHash).Scan(&result.Status, &userID, &result.ExpiresAt)
	result.ApprovedUserID = userID.String
	return result, err
}

func (s *PostgresStore) ClaimQRLogin(ctx context.Context, requestHash string) (string, error) {
	var userID string
	err := s.db.QueryRowContext(ctx, `UPDATE qr_login_requests SET status = 'completed', completed_at = now() WHERE request_hash = $1 AND status = 'approved' AND expires_at > now() RETURNING approved_user_id`, requestHash).Scan(&userID)
	return userID, err
}

func (s *PostgresStore) TransitionQRLogin(ctx context.Context, requestHash, status, familyID, userID string) (bool, error) {
	result, err := s.db.ExecContext(ctx, `UPDATE qr_login_requests SET status = $1, family_id = $2, approved_user_id = CASE WHEN $1 = 'approved' THEN $3 ELSE NULL END WHERE request_hash = $4 AND status = 'pending' AND expires_at > now() AND (family_id IS NULL OR family_id = $2)`, status, familyID, userID, requestHash)
	if err != nil { return false, err }
	count, err := result.RowsAffected()
	return count == 1, err
}

func (s *PostgresStore) FamilyChatID(ctx context.Context, familyID string) (string, error) {
	var id string
	err := s.db.QueryRowContext(ctx, `SELECT id FROM chats WHERE family_id = $1 AND type = 'family' LIMIT 1`, familyID).Scan(&id)
	if err == sql.ErrNoRows { return "", nil }
	return id, err
}

func (s *PostgresStore) AcceptPasskeyInvite(ctx context.Context, p identity.PasskeyInviteAcceptance) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil { return err }
	defer func() { _ = tx.Rollback() }()
	if _, err = tx.ExecContext(ctx, `INSERT INTO users (id, family_id, username, password_hash, display_name, role, profile_visibility, last_seen_visibility, read_receipts_enabled, is_active, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,1,$10)`, p.UserID, p.FamilyID, p.Username, p.PasswordHash, p.DisplayName, p.Role, p.ProfileVisibility, p.LastSeenVisibility, p.ReadReceiptsEnabled, p.CreatedAt); err != nil { return err }
	result, err := tx.ExecContext(ctx, `UPDATE invites SET used_count = used_count + 1 WHERE id = $1 AND revoked_at IS NULL AND expires_at > $2 AND used_count < max_uses`, p.InviteID, p.CreatedAt)
	if err != nil { return err }
	count, err := result.RowsAffected()
	if err != nil { return err }
	if count != 1 { return sql.ErrNoRows }
	if _, err = tx.ExecContext(ctx, `INSERT INTO passkey_credentials (id, user_id, family_id, credential_id, credential_data) VALUES ($1,$2,$3,$4,$5::jsonb)`, p.CredentialRecordID, p.UserID, p.FamilyID, p.CredentialID, p.CredentialData); err != nil { return err }
	if p.FamilyChatID != "" {
	if _, err = tx.ExecContext(ctx, `INSERT INTO chat_members (chat_id,user_id,created_at) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, p.FamilyChatID, p.UserID, p.CreatedAt); err != nil { return err }
	if _, err = tx.ExecContext(ctx, `INSERT INTO chat_preferences (chat_id,user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, p.FamilyChatID, p.UserID); err != nil { return err }
	}
	if _, err = tx.ExecContext(ctx, `INSERT INTO refresh_tokens (id,user_id,token_hash,expires_at,created_at,ip_address) VALUES ($1,$2,$3,$4,$5,$6)`, p.RefreshTokenID, p.UserID, p.RefreshTokenHash, p.RefreshExpiresAt, p.CreatedAt, p.IPAddress); err != nil { return err }
	return tx.Commit()
}

func (s *PostgresStore) CreateAndroidQRLoginGrant(ctx context.Context, idHash, familyID, userID string, expiresAt time.Time) error {
	_, err := s.db.ExecContext(ctx, `INSERT INTO android_qr_login_grants (id_hash, family_id, user_id, expires_at) VALUES ($1, $2, $3, $4)`, idHash, familyID, userID, expiresAt)
	return err
}

func (s *PostgresStore) ConsumeAndroidQRLoginGrant(ctx context.Context, idHash string) (identity.AndroidQRLoginGrant, error) {
	var grant identity.AndroidQRLoginGrant
	err := s.db.QueryRowContext(ctx, `UPDATE android_qr_login_grants SET consumed_at = now() WHERE id_hash = $1 AND consumed_at IS NULL AND expires_at > now() RETURNING family_id, user_id, expires_at`, idHash).Scan(&grant.FamilyID, &grant.UserID, &grant.ExpiresAt)
	return grant, err
}
