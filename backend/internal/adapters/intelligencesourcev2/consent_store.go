package intelligencesourcev2

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"github.com/google/uuid"
)

type ConsentAuthorization struct {
	CodeHash []byte
	ClientID, RedirectURI, UserID, FamilyID, ChatID, CodeChallenge string
	Grants map[string]bool
	Now, ExpiresAt time.Time
}

type CredentialExchange struct {
	CodeHash, CredentialHash []byte
	ClientID, RedirectURI string
	VerifyPKCE func(string) bool
	Now, CredentialExpiresAt time.Time
}

type IssuedCredential struct {
	ConnectionID string
	Grants map[string]bool
}

func (s *Store) AuthorizeConsent(ctx context.Context, input ConsentAuthorization) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil { return err }
	defer func() { _ = tx.Rollback() }()
	installationID, err := oneEnabledInstallationID(ctx, tx, input.FamilyID)
	if err != nil { return err }
	var accessible bool
	err = tx.QueryRowContext(ctx, `
		SELECT true FROM public.users u
		JOIN public.chat_members cm ON cm.user_id=u.id
		JOIN public.chats ch ON ch.id=cm.chat_id AND ch.family_id=u.family_id
		WHERE u.id=$1 AND u.family_id=$2 AND u.is_active=1 AND ch.id=$3
		FOR SHARE OF u,cm,ch`, input.UserID, input.FamilyID, input.ChatID).Scan(&accessible)
	if errors.Is(err, sql.ErrNoRows) { return ErrForbidden }
	if err != nil { return err }
	if _, err := tx.ExecContext(ctx, `DELETE FROM public.intelligence_source_v2_consent_codes WHERE expires_at <= $1`, input.Now); err != nil { return err }
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO public.intelligence_source_v2_consent_codes
			(code_hash,client_id,redirect_uri,installation_id,user_id,family_id,chat_id,code_challenge,
			 read_granted,process_granted,external_transfer_granted,export_granted,expires_at,created_at)
		VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`, input.CodeHash, input.ClientID, input.RedirectURI,
		installationID, input.UserID, input.FamilyID, input.ChatID, input.CodeChallenge,
		input.Grants["read"], input.Grants["process"], input.Grants["external_transfer"], input.Grants["export"], input.ExpiresAt, input.Now); err != nil { return err }
	if err := insertAudit(ctx, tx, installationID, "", input.UserID, "consent_authorize", "issued", "", input.Now); err != nil { return err }
	return tx.Commit()
}

func (s *Store) ExchangeConsentCode(ctx context.Context, input CredentialExchange) (IssuedCredential, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil { return IssuedCredential{}, err }
	defer func() { _ = tx.Rollback() }()
	var installationID, userID, familyID, chatID, challenge string
	var readGranted, processGranted, externalTransferGranted, exportGranted bool
	err = tx.QueryRowContext(ctx, `
		SELECT installation_id,user_id,family_id,chat_id,code_challenge,
		       read_granted,process_granted,external_transfer_granted,export_granted
		FROM public.intelligence_source_v2_consent_codes
		WHERE code_hash=$1 AND client_id=$2 AND redirect_uri=$3 AND expires_at>$4 FOR UPDATE`, input.CodeHash, input.ClientID, input.RedirectURI, input.Now).Scan(
		&installationID, &userID, &familyID, &chatID, &challenge, &readGranted, &processGranted, &externalTransferGranted, &exportGranted)
	if errors.Is(err, sql.ErrNoRows) { return IssuedCredential{}, ErrNotFound }
	if err != nil { return IssuedCredential{}, err }
	if input.VerifyPKCE == nil || !input.VerifyPKCE(challenge) { return IssuedCredential{}, ErrInvalidPKCE }
	var active bool
	err = tx.QueryRowContext(ctx, `
		SELECT true FROM public.users u
		JOIN public.families f ON f.id=u.family_id AND f.id=$2
		JOIN public.chat_members cm ON cm.user_id=u.id
		JOIN public.chats ch ON ch.id=cm.chat_id AND ch.id=$3 AND ch.family_id=f.id
		JOIN public.intelligence_installations i ON i.id=$4 AND i.family_id=f.id AND i.enabled
		WHERE u.id=$1 AND u.is_active=1 FOR SHARE OF u,f,cm,ch,i`, userID, familyID, chatID, installationID).Scan(&active)
	if errors.Is(err, sql.ErrNoRows) { return IssuedCredential{}, ErrForbidden }
	if err != nil { return IssuedCredential{}, err }
	result := IssuedCredential{ConnectionID: uuid.NewString(), Grants: map[string]bool{
		"read": readGranted, "process": processGranted, "external_transfer": externalTransferGranted, "export": exportGranted,
	}}
	if _, err := tx.ExecContext(ctx, `INSERT INTO public.intelligence_source_v2_connections(id,installation_id,principal_user_id,credential_hash,enabled,credential_expires_at,created_at) VALUES($1,$2,$3,$4,true,$5,$6)`, result.ConnectionID, installationID, userID, input.CredentialHash, input.CredentialExpiresAt, input.Now); err != nil { return IssuedCredential{}, err }
	if _, err := tx.ExecContext(ctx, `INSERT INTO public.intelligence_source_v2_connection_chats(connection_id,chat_id) VALUES($1,$2)`, result.ConnectionID, chatID); err != nil { return IssuedCredential{}, err }
	for _, grantType := range []string{"read", "process", "external_transfer", "export"} {
		var grantedAt any
		if result.Grants[grantType] { grantedAt = input.Now }
		if _, err := tx.ExecContext(ctx, `INSERT INTO public.intelligence_source_v2_connection_grants(connection_id,grant_type,granted,granted_at,updated_at) VALUES($1,$2,$3,$4,$5)`, result.ConnectionID, grantType, result.Grants[grantType], grantedAt, input.Now); err != nil { return IssuedCredential{}, err }
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM public.intelligence_source_v2_consent_codes WHERE code_hash=$1`, input.CodeHash); err != nil { return IssuedCredential{}, err }
	if err := insertAudit(ctx, tx, installationID, result.ConnectionID, userID, "token_exchange", "issued", "", input.Now); err != nil { return IssuedCredential{}, err }
	if err := tx.Commit(); err != nil { return IssuedCredential{}, err }
	return result, nil
}
