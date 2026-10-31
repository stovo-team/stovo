package main

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/base64"
	"errors"
	"io"
	"net/url"
	"strings"
	"unicode"
	"unicode/utf8"
)

type enrollmentRequest struct{ FamilyID, TenantID, UserID, Issuer string }
type enrollmentResult struct {
	InstallationID string `json:"installation_id"`
	Subject        string `json:"subject"`
	TenantID       string `json:"tenant_id"`
	PrincipalID    string `json:"principal_id"`
}

func runEnrollment(ctx context.Context, args []string, stdout, stderr io.Writer, db *sql.DB, issuer string) int {
	values, ok := parseExactFlags(args, "family-id", "tenant-id", "user-id")
	if !ok || !validEnrollmentIssuer(issuer) {
		return writeFailure(stderr, "invalid arguments", 2)
	}
	result, err := enrollInstallation(ctx, db, enrollmentRequest{
		FamilyID: values["family-id"], TenantID: values["tenant-id"],
		UserID: values["user-id"], Issuer: issuer,
	})
	if err != nil {
		return writeFailure(stderr, "enrollment failed", 1)
	}
	return writeJSON(stdout, stderr, result)
}

func enrollInstallation(ctx context.Context, db *sql.DB, request enrollmentRequest) (enrollmentResult, error) {
	invalid := errors.New("invalid enrollment")
	if db == nil || !validEnrollmentID(request.FamilyID) || !validEnrollmentID(request.TenantID) || !validEnrollmentID(request.UserID) || !validEnrollmentIssuer(request.Issuer) {
		return enrollmentResult{}, invalid
	}
	tx, err := db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelSerializable})
	if err != nil {
		return enrollmentResult{}, err
	}
	defer func() { _ = tx.Rollback() }()
	var id string
	if err := tx.QueryRowContext(ctx, `SELECT id FROM public.families WHERE id=$1 FOR UPDATE`, request.FamilyID).Scan(&id); err != nil {
		return enrollmentResult{}, err
	}
	if err := tx.QueryRowContext(ctx, `SELECT id FROM public.users WHERE id=$1 AND family_id=$2 AND is_active=1 FOR SHARE`, request.UserID, request.FamilyID).Scan(&id); err != nil {
		return enrollmentResult{}, err
	}

	rows, err := tx.QueryContext(ctx, `SELECT id, tenant_id FROM public.intelligence_installations WHERE family_id=$1 AND enabled ORDER BY id LIMIT 2 FOR UPDATE`, request.FamilyID)
	if err != nil {
		return enrollmentResult{}, err
	}
	var existing []enrollmentResult
	for rows.Next() {
		var row enrollmentResult
		if err := rows.Scan(&row.InstallationID, &row.TenantID); err != nil {
			_ = rows.Close()
			return enrollmentResult{}, err
		}
		existing = append(existing, row)
	}
	err = rows.Err()
	if closeErr := rows.Close(); err == nil {
		err = closeErr
	}
	if err != nil {
		return enrollmentResult{}, err
	}
	if len(existing) > 1 || (len(existing) == 1 && existing[0].TenantID != request.TenantID) {
		return enrollmentResult{}, invalid
	}
	result := enrollmentResult{TenantID: request.TenantID, PrincipalID: request.UserID}
	if len(existing) == 1 {
		result.InstallationID = existing[0].InstallationID
	} else {
		installationID, err := enrollmentRandomToken()
		if err != nil {
			return enrollmentResult{}, err
		}
		result.InstallationID = installationID
		if _, err := tx.ExecContext(ctx, `INSERT INTO public.intelligence_installations(id,tenant_id,family_id,enabled) VALUES($1,$2,$3,true)`, installationID, request.TenantID, request.FamilyID); err != nil {
			return enrollmentResult{}, err
		}
	}
	subject, err := enrollmentRandomToken()
	if err != nil {
		return enrollmentResult{}, err
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO public.intelligence_oidc_subjects(issuer,user_id,subject) VALUES($1,$2,$3) ON CONFLICT (issuer,user_id) DO NOTHING`, request.Issuer, request.UserID, subject); err != nil {
		return enrollmentResult{}, err
	}
	if err := tx.QueryRowContext(ctx, `SELECT subject FROM public.intelligence_oidc_subjects WHERE issuer=$1 AND user_id=$2`, request.Issuer, request.UserID).Scan(&result.Subject); err != nil {
		return enrollmentResult{}, err
	}
	if err := tx.Commit(); err != nil {
		return enrollmentResult{}, err
	}
	return result, nil
}

func enrollmentRandomToken() (string, error) {
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(raw), nil
}

func validEnrollmentID(value string) bool {
	return value != "" && len(value) <= 256 && utf8.ValidString(value) && strings.TrimSpace(value) == value && strings.IndexFunc(value, unicode.IsControl) == -1
}

func validEnrollmentIssuer(value string) bool {
	parsed, err := url.Parse(value)
	return err == nil && parsed.Scheme == "https" && parsed.Hostname() != "" && parsed.Host == strings.ToLower(parsed.Host) && parsed.Port() != "443" && parsed.User == nil && parsed.Path == "" && parsed.RawPath == "" && parsed.RawQuery == "" && !parsed.ForceQuery && parsed.Fragment == "" && parsed.String() == value
}
