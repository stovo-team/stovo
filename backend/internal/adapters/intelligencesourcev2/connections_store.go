package intelligencesourcev2

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"github.com/google/uuid"
)

var ErrNotFound = errors.New("intelligence source record not found")
var ErrForbidden = errors.New("intelligence source operation forbidden")
var ErrInvalidRequest = errors.New("invalid intelligence source request")
var ErrUnavailable = errors.New("intelligence source unavailable")

type RotatedCredential struct {
	InstallationID  string
	PrincipalUserID string
	ChatID          string
	Grants          map[string]bool
}

func (s *Store) RotateCredential(ctx context.Context, connectionID string, oldDigest, newDigest []byte, expiresAt, now time.Time) (RotatedCredential, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil { return RotatedCredential{}, err }
	defer func() { _ = tx.Rollback() }()
	var rotated RotatedCredential
	err = tx.QueryRowContext(ctx, `
		SELECT i.id,c.principal_user_id,
		       (SELECT scope.chat_id FROM public.intelligence_source_v2_connection_chats scope WHERE scope.connection_id=c.id)
		FROM public.intelligence_source_v2_connections c
		JOIN public.intelligence_installations i ON i.id=c.installation_id AND i.enabled
		JOIN public.users u ON u.id=c.principal_user_id AND u.is_active=1 AND u.family_id=i.family_id
		WHERE c.id=$1 AND c.credential_hash=$2 AND c.enabled AND c.revoked_at IS NULL
		  AND c.credential_expires_at>$3
		  AND (SELECT count(*) FROM public.intelligence_source_v2_connection_chats scope WHERE scope.connection_id=c.id)=1
		  AND EXISTS (SELECT 1 FROM public.intelligence_source_v2_connection_chats scope
		    JOIN public.chats ch ON ch.id=scope.chat_id AND ch.family_id=i.family_id
		    JOIN public.chat_members cm ON cm.chat_id=ch.id AND cm.user_id=u.id WHERE scope.connection_id=c.id)
		FOR UPDATE OF c`, connectionID, oldDigest, now).Scan(&rotated.InstallationID, &rotated.PrincipalUserID, &rotated.ChatID)
	if err != nil { return RotatedCredential{}, err }
	update, err := tx.ExecContext(ctx, `UPDATE public.intelligence_source_v2_connections SET credential_hash=$1,credential_expires_at=$2 WHERE id=$3 AND credential_hash=$4 AND enabled AND revoked_at IS NULL AND credential_expires_at>$5`, newDigest, expiresAt, connectionID, oldDigest, now)
	if err != nil { return RotatedCredential{}, err }
	if affected, err := update.RowsAffected(); err != nil { return RotatedCredential{}, err } else if affected != 1 { return RotatedCredential{}, ErrNotFound }
	rotated.Grants, err = readGrants(ctx, tx, connectionID)
	if err != nil { return RotatedCredential{}, err }
	if err := insertAudit(ctx, tx, rotated.InstallationID, connectionID, rotated.PrincipalUserID, "credential_rotate", "rotated", "", now); err != nil { return RotatedCredential{}, err }
	if err := tx.Commit(); err != nil { return RotatedCredential{}, err }
	return rotated, nil
}

func (s *Store) Revoke(ctx context.Context, connectionID, principalUserID, grantType string, now time.Time) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil { return err }
	defer func() { _ = tx.Rollback() }()
	var installationID, chatID string
	var connectionEnabled bool
	var revokedAt sql.NullTime
	err = tx.QueryRowContext(ctx, `
		SELECT c.installation_id,scope.chat_id,c.enabled,c.revoked_at
		FROM public.intelligence_source_v2_connections c
		JOIN public.intelligence_source_v2_connection_chats scope ON scope.connection_id=c.id
		WHERE c.id=$1 AND c.principal_user_id=$2 FOR UPDATE OF c`, connectionID, principalUserID).Scan(&installationID, &chatID, &connectionEnabled, &revokedAt)
	if errors.Is(err, sql.ErrNoRows) { return ErrNotFound }
	if err != nil { return err }
	if grantType != "" {
		var wasGranted bool
		if err := tx.QueryRowContext(ctx, `SELECT granted FROM public.intelligence_source_v2_connection_grants WHERE connection_id=$1 AND grant_type=$2`, connectionID, grantType).Scan(&wasGranted); err != nil {
			if errors.Is(err, sql.ErrNoRows) { return ErrNotFound }
			return err
		}
		if wasGranted { if err := emitScopeTombstone(ctx, tx, connectionID, chatID, "grant_revoked:"+grantType, grantType == "read"); err != nil { return err } }
		result, err := tx.ExecContext(ctx, `UPDATE public.intelligence_source_v2_connection_grants SET granted=false,revoked_at=COALESCE(revoked_at,$1),updated_at=$1 WHERE connection_id=$2 AND grant_type=$3`, now, connectionID, grantType)
		if err != nil { return err }
		if affected, err := result.RowsAffected(); err != nil { return err } else if affected != 1 { return ErrNotFound }
		if err := insertAudit(ctx, tx, installationID, connectionID, principalUserID, "grant_revoke", "revoked", grantType, now); err != nil { return err }
	} else {
		if connectionEnabled && !revokedAt.Valid { if err := emitScopeTombstone(ctx, tx, connectionID, chatID, "connection_revoked", true); err != nil { return err } }
		if _, err := tx.ExecContext(ctx, `UPDATE public.intelligence_source_v2_connections SET enabled=false,revoked_at=COALESCE(revoked_at,$1) WHERE id=$2 AND principal_user_id=$3`, now, connectionID, principalUserID); err != nil { return err }
		if _, err := tx.ExecContext(ctx, `UPDATE public.intelligence_source_v2_connection_grants SET granted=false,revoked_at=COALESCE(revoked_at,$1),updated_at=$1 WHERE connection_id=$2`, now, connectionID); err != nil { return err }
		if err := insertAudit(ctx, tx, installationID, connectionID, principalUserID, "connection_revoke", "revoked", "", now); err != nil { return err }
	}
	return tx.Commit()
}

func readGrants(ctx context.Context, tx *sql.Tx, connectionID string) (map[string]bool, error) {
	rows, err := tx.QueryContext(ctx, `SELECT grant_type,granted FROM public.intelligence_source_v2_connection_grants WHERE connection_id=$1`, connectionID)
	if err != nil { return nil, err }
	defer func() { _ = rows.Close() }()
	grants := make(map[string]bool, 4)
	for rows.Next() { var grant string; var granted bool; if err := rows.Scan(&grant, &granted); err != nil { return nil, err }; grants[grant] = granted }
	if err := rows.Err(); err != nil { return nil, err }
	if len(grants) != 4 { return nil, errors.New("incomplete intelligence source v2 grant records") }
	return grants, nil
}

func insertAudit(ctx context.Context, tx *sql.Tx, installationID, connectionID, principalUserID, operation, result, grantType string, now time.Time) error {
	_, err := tx.ExecContext(ctx, `INSERT INTO public.intelligence_source_v2_audit(id,installation_id,connection_id,principal_user_id,operation,result,grant_type,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, uuid.NewString(), nullable(installationID), nullable(connectionID), nullable(principalUserID), operation, result, nullable(grantType), now)
	return err
}

func nullable(value string) any { if value == "" { return nil }; return value }

func emitScopeTombstone(ctx context.Context, tx *sql.Tx, connectionID, chatID, reason string, purgePayloads bool) error {
	var eventID string
	err := tx.QueryRowContext(ctx, `SELECT public.intelligence_source_v2_emit_acl_tombstone($1,$2,$3,$4,$5)`, connectionID, chatID, "chat:"+chatID, reason, purgePayloads).Scan(&eventID)
	if err != nil { return err }
	if eventID == "" { return errors.New("empty ACL tombstone event id") }
	return nil
}
