package intelligencesourcev2

import (
	"context"
	"database/sql"
	"errors"
	"time"
)

type BrowserSession struct {
	TicketHash []byte
	Flow, UserID, FamilyID string
	ClientID, RedirectURI, State string
	CodeChallenge, CodeChallengeMethod, Nonce string
	ChatID string
	Grants map[string]bool
	CreatedAt, ExpiresAt time.Time
}

type OIDCBrowserSessionExpectation struct {
	ClientID, RedirectURI, State, Nonce, CodeChallenge, CodeChallengeMethod string
	ResponseTypeCode bool
	AllowedClientID bool
	RedirectURIAllowed bool
}

type OIDCBrowserAuthorization struct { UserID, RedirectURI, State string }

type SourceV2BrowserAuthorization struct {
	TicketHash, CodeHash []byte
	ClientID, RedirectURI, State, CodeChallenge, CodeChallengeMethod, ChatID string
	Grants map[string]bool
	Now, CodeExpiresAt time.Time
}

func (s *Store) CreateBrowserSession(ctx context.Context, session BrowserSession) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil { return err }
	defer func() { _ = tx.Rollback() }()
	if _, err := tx.ExecContext(ctx, `DELETE FROM public.intelligence_browser_authorization_sessions WHERE expires_at <= $1`, session.CreatedAt); err != nil { return err }
	var chatValue, nonceValue any
	if session.Flow == "oidc" {
		nonceValue = session.Nonce
	} else {
		if err := oneEnabledInstallationForFamily(ctx, tx, session.FamilyID); err != nil { return err }
		var accessible bool
		err := tx.QueryRowContext(ctx, `
			SELECT true FROM public.users u
			JOIN public.chat_members cm ON cm.chat_id=$3 AND cm.user_id=u.id
			JOIN public.chats ch ON ch.id=cm.chat_id AND ch.family_id=u.family_id
			WHERE u.id=$1 AND u.family_id=$2 AND u.is_active=1
			FOR SHARE OF u,cm,ch`, session.UserID, session.FamilyID, session.ChatID).Scan(&accessible)
		if errors.Is(err, sql.ErrNoRows) { return ErrForbidden }
		if err != nil { return err }
		chatValue = session.ChatID
	}
	_, err = tx.ExecContext(ctx, `
		INSERT INTO public.intelligence_browser_authorization_sessions
			(ticket_hash,flow,user_id,family_id,client_id,redirect_uri,state,code_challenge,code_challenge_method,nonce,chat_id,
			 read_granted,process_granted,external_transfer_granted,export_granted,expires_at,created_at)
		VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
		session.TicketHash, session.Flow, session.UserID, session.FamilyID, session.ClientID, session.RedirectURI, session.State,
		session.CodeChallenge, session.CodeChallengeMethod, nonceValue, chatValue,
		session.Grants["read"], session.Grants["process"], session.Grants["external_transfer"], session.Grants["export"], session.ExpiresAt, session.CreatedAt)
	if err != nil { return err }
	return tx.Commit()
}

func (s *Store) AuthorizeOIDCBrowserSession(ctx context.Context, ticketHash, codeHash []byte, now, codeExpires, codeCreated time.Time, expected OIDCBrowserSessionExpectation, validUser func(string) bool) (OIDCBrowserAuthorization, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil { return OIDCBrowserAuthorization{}, err }
	defer func() { _ = tx.Rollback() }()
	var record OIDCBrowserAuthorization
	var familyID, clientID, challenge, method, nonce string
	err = tx.QueryRowContext(ctx, `
		SELECT user_id,family_id,client_id,redirect_uri,state,code_challenge,code_challenge_method,nonce
		FROM public.intelligence_browser_authorization_sessions
		WHERE ticket_hash=$1 AND flow='oidc' AND expires_at>$2 FOR UPDATE`, ticketHash, now).
		Scan(&record.UserID, &familyID, &clientID, &record.RedirectURI, &record.State, &challenge, &method, &nonce)
	if errors.Is(err, sql.ErrNoRows) { return OIDCBrowserAuthorization{}, ErrNotFound }
	if err != nil { return OIDCBrowserAuthorization{}, err }
	if !expected.ResponseTypeCode || expected.ClientID != clientID || expected.RedirectURI != record.RedirectURI || expected.State != record.State || expected.Nonce != nonce || expected.CodeChallenge != challenge || expected.CodeChallengeMethod != method || !expected.AllowedClientID || !expected.RedirectURIAllowed {
		return OIDCBrowserAuthorization{}, ErrInvalidRequest
	}
	var active bool
	err = tx.QueryRowContext(ctx, `SELECT true FROM public.users WHERE id=$1 AND family_id=$2 AND is_active=1 FOR SHARE`, record.UserID, familyID).Scan(&active)
	if errors.Is(err, sql.ErrNoRows) { return OIDCBrowserAuthorization{}, ErrForbidden }
	if err != nil { return OIDCBrowserAuthorization{}, err }
	if !validUser(record.UserID) { return OIDCBrowserAuthorization{}, ErrForbidden }
	if _, err := tx.ExecContext(ctx, `DELETE FROM public.intelligence_oidc_authorization_codes WHERE expires_at <= $1`, now); err != nil { return OIDCBrowserAuthorization{}, err }
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO public.intelligence_oidc_authorization_codes(code_hash,client_id,redirect_uri,user_id,code_challenge,nonce,expires_at,created_at)
		VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, codeHash, clientID, record.RedirectURI, record.UserID, challenge, nonce, codeExpires, codeCreated); err != nil { return OIDCBrowserAuthorization{}, err }
	if _, err := tx.ExecContext(ctx, `DELETE FROM public.intelligence_browser_authorization_sessions WHERE ticket_hash=$1`, ticketHash); err != nil { return OIDCBrowserAuthorization{}, err }
	if err := tx.Commit(); err != nil { return OIDCBrowserAuthorization{}, err }
	return record, nil
}

func (s *Store) AuthorizeSourceV2BrowserSession(ctx context.Context, input SourceV2BrowserAuthorization) (OIDCBrowserAuthorization, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil { return OIDCBrowserAuthorization{}, err }
	defer func() { _ = tx.Rollback() }()
	var record OIDCBrowserAuthorization
	var familyID, challenge, method, chatID string
	var readGranted, processGranted, externalTransferGranted, exportGranted bool
	err = tx.QueryRowContext(ctx, `
		SELECT user_id,family_id,client_id,redirect_uri,state,code_challenge,code_challenge_method,chat_id,
		       read_granted,process_granted,external_transfer_granted,export_granted
		FROM public.intelligence_browser_authorization_sessions
		WHERE ticket_hash=$1 AND flow='source_v2' AND expires_at>$2 FOR UPDATE`, input.TicketHash, input.Now).Scan(
		&record.UserID, &familyID, &record.ClientID, &record.RedirectURI, &record.State, &challenge, &method, &chatID,
		&readGranted, &processGranted, &externalTransferGranted, &exportGranted)
	if errors.Is(err, sql.ErrNoRows) { return OIDCBrowserAuthorization{}, ErrNotFound }
	if err != nil { return OIDCBrowserAuthorization{}, err }
	grants := map[string]bool{"read": readGranted, "process": processGranted, "external_transfer": externalTransferGranted, "export": exportGranted}
	if record.ClientID != input.ClientID || record.RedirectURI != input.RedirectURI || record.State != input.State || challenge != input.CodeChallenge || method != input.CodeChallengeMethod || chatID != input.ChatID || len(input.Grants) != 4 || input.Grants["read"] != readGranted || input.Grants["process"] != processGranted || input.Grants["external_transfer"] != externalTransferGranted || input.Grants["export"] != exportGranted {
		return OIDCBrowserAuthorization{}, ErrInvalidRequest
	}
	installationID, err := oneEnabledInstallationID(ctx, tx, familyID)
	if err != nil { return OIDCBrowserAuthorization{}, err }
	var accessible bool
	err = tx.QueryRowContext(ctx, `
		SELECT true FROM public.users u
		JOIN public.families f ON f.id=u.family_id AND f.id=$2
		JOIN public.chat_members cm ON cm.user_id=u.id AND cm.chat_id=$3
		JOIN public.chats ch ON ch.id=cm.chat_id AND ch.family_id=f.id
		WHERE u.id=$1 AND u.is_active=1 FOR SHARE OF u,f,cm,ch`, record.UserID, familyID, chatID).Scan(&accessible)
	if errors.Is(err, sql.ErrNoRows) { return OIDCBrowserAuthorization{}, ErrForbidden }
	if err != nil { return OIDCBrowserAuthorization{}, err }
	if _, err := tx.ExecContext(ctx, `DELETE FROM public.intelligence_source_v2_consent_codes WHERE expires_at <= $1`, input.Now); err != nil { return OIDCBrowserAuthorization{}, err }
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO public.intelligence_source_v2_consent_codes
			(code_hash,client_id,redirect_uri,installation_id,user_id,family_id,chat_id,code_challenge,
			 read_granted,process_granted,external_transfer_granted,export_granted,expires_at,created_at)
		VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`, input.CodeHash, record.ClientID, record.RedirectURI,
		installationID, record.UserID, familyID, chatID, challenge, grants["read"], grants["process"], grants["external_transfer"], grants["export"], input.CodeExpiresAt, input.Now); err != nil { return OIDCBrowserAuthorization{}, err }
	if _, err := tx.ExecContext(ctx, `DELETE FROM public.intelligence_browser_authorization_sessions WHERE ticket_hash=$1`, input.TicketHash); err != nil { return OIDCBrowserAuthorization{}, err }
	if err := insertAudit(ctx, tx, installationID, "", record.UserID, "consent_authorize", "issued", "", input.Now); err != nil { return OIDCBrowserAuthorization{}, err }
	if err := tx.Commit(); err != nil { return OIDCBrowserAuthorization{}, err }
	return record, nil
}

func oneEnabledInstallationForFamily(ctx context.Context, tx *sql.Tx, familyID string) error {
	_, err := oneEnabledInstallationID(ctx, tx, familyID)
	return err
}

func oneEnabledInstallationID(ctx context.Context, tx *sql.Tx, familyID string) (string, error) {
	rows, err := tx.QueryContext(ctx, `SELECT id FROM public.intelligence_installations WHERE family_id=$1 AND enabled ORDER BY id LIMIT 2 FOR SHARE`, familyID)
	if err != nil { return "", err }
	defer func() { _ = rows.Close() }()
	var ids []string
	for rows.Next() { var id string; if err := rows.Scan(&id); err != nil { return "", err }; ids = append(ids, id) }
	if err := rows.Err(); err != nil { return "", err }
	if len(ids) != 1 { return "", ErrUnavailable }
	return ids[0], nil
}
