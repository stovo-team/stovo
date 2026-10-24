package intelligencesourcev2

import (
	"context"
	"database/sql"
	"errors"
	"time"
)

type OIDCAuthorizationCode struct {
	UserID, Nonce string
}

var ErrInvalidPKCE = errors.New("invalid PKCE verifier")

func (s *Store) ConsumeOIDCAuthorizationCode(ctx context.Context, digest []byte, clientID, redirectURI string, now time.Time, validPKCE func(string) bool) (OIDCAuthorizationCode, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return OIDCAuthorizationCode{}, err
	}
	defer func() { _ = tx.Rollback() }()
	var record OIDCAuthorizationCode
	var challenge string
	err = tx.QueryRowContext(ctx, `
		SELECT user_id,code_challenge,nonce
		FROM public.intelligence_oidc_authorization_codes
		WHERE code_hash=$1 AND client_id=$2 AND redirect_uri=$3 AND expires_at>$4
		FOR UPDATE`, digest, clientID, redirectURI, now).Scan(&record.UserID, &challenge, &record.Nonce)
	if errors.Is(err, sql.ErrNoRows) {
		return OIDCAuthorizationCode{}, ErrNotFound
	}
	if err != nil {
		return OIDCAuthorizationCode{}, err
	}
	if !validPKCE(challenge) {
		return OIDCAuthorizationCode{}, ErrInvalidPKCE
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM public.intelligence_oidc_authorization_codes WHERE code_hash=$1`, digest); err != nil {
		return OIDCAuthorizationCode{}, err
	}
	if err := tx.Commit(); err != nil {
		return OIDCAuthorizationCode{}, err
	}
	return record, nil
}
