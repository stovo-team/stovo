package orchestrator

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"database/sql"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"net"
	"net/url"
	"os"
	"regexp"
	"sort"
	"strconv"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

var tenantSlugPattern = regexp.MustCompile(`^[a-zA-Z0-9_-]{1,48}$`)
var poolerHostPattern = regexp.MustCompile(`^[A-Za-z0-9.-]+$`)
var pgBouncerAdminPasswordPattern = regexp.MustCompile(`^[A-Fa-f0-9]{32,}$`)
var tenantRuntimePasswordPattern = regexp.MustCompile(`^[A-Za-z0-9_-]{1,128}$`)

// quotePostgresIdentifier safely quotes a PostgreSQL identifier. Bind parameters
// cannot be used for database, schema, table, or role names.
func quotePostgresIdentifier(identifier string) string {
	return (pgx.Identifier{identifier}).Sanitize()
}

func validTenantRuntimePassword(password string) bool {
	return tenantRuntimePasswordPattern.MatchString(password)
}

func validatePgBouncerAdminPassword(password string) error {
	if !pgBouncerAdminPasswordPattern.MatchString(password) {
		return errors.New("PGBOUNCER_ADMIN_PASSWORD must be at least 32 hexadecimal characters")
	}
	return nil
}

func pgbouncerEnabled() bool {
	return strings.EqualFold(strings.TrimSpace(os.Getenv("PGBOUNCER_ENABLED")), "true")
}

func renderPgBouncerAuthFile(users map[string]string) (string, error) {
	names := make([]string, 0, len(users))
	for user, credential := range users {
		if !tenantSlugPattern.MatchString(user) || credential == "" || strings.ContainsAny(user+credential, "\r\n\x00") {
			return "", fmt.Errorf("invalid PgBouncer authentication identity")
		}
		names = append(names, user)
	}
	sort.Strings(names)
	var output strings.Builder
	for _, user := range names {
		quote := func(value string) string {
			value = strings.ReplaceAll(value, `\`, `\\`)
			value = strings.ReplaceAll(value, `"`, `\"`)
			return `"` + value + `"`
		}
		output.WriteString(quote(user) + " " + quote(users[user]) + "\n")
	}
	return output.String(), nil
}

func buildTenantDatabaseURLs(slug, directURL, poolerHost, poolerPort, runtimeUser, runtimePassword string) (string, string, error) {
	return buildTenantDatabaseURLsWithPooler(slug, directURL, poolerHost, poolerPort, runtimeUser, runtimePassword, true)
}

func buildTenantDatabaseURLsWithPooler(slug, directURL, poolerHost, poolerPort, runtimeUser, runtimePassword string, usePgBouncer bool) (string, string, error) {
	if !tenantSlugPattern.MatchString(slug) {
		return "", "", fmt.Errorf("invalid tenant slug")
	}
	directURL = strings.TrimSpace(directURL)
	if directURL == "" {
		directURL = "postgres://postgres:postgres@postgres:5432/stovo_db_{slug}?sslmode=disable"
	}
	direct, err := url.Parse(directURL)
	if err != nil || direct.Scheme != "postgres" && direct.Scheme != "postgresql" || direct.Host == "" {
		return "", "", fmt.Errorf("invalid direct tenant database URL")
	}
	if !strings.Contains(direct.Path, "{slug}") {
		return "", "", fmt.Errorf("direct tenant database URL must include the {slug} database placeholder")
	}
	direct.Path = "/" + strings.TrimPrefix(strings.ReplaceAll(strings.TrimPrefix(direct.Path, "/"), "{slug}", slug), "/")
	migration := direct.String()
	if runtimeUser == "" || runtimePassword == "" {
		return "", "", fmt.Errorf("tenant runtime credentials are required")
	}
	if !usePgBouncer {
		direct.User = url.UserPassword(runtimeUser, runtimePassword)
		return direct.String(), migration, nil
	}
	if strings.TrimSpace(poolerHost) == "" || strings.ContainsAny(poolerHost, " /\\") || !poolerHostPattern.MatchString(poolerHost) {
		return "", "", fmt.Errorf("invalid PgBouncer host")
	}
	if strings.Contains(poolerHost, ":") && net.ParseIP(poolerHost) == nil {
		return "", "", fmt.Errorf("invalid PgBouncer host")
	}
	if net.ParseIP(poolerHost) == nil && strings.TrimSpace(poolerHost) != poolerHost {
		return "", "", fmt.Errorf("invalid PgBouncer host")
	}
	port, err := strconv.Atoi(poolerPort)
	if err != nil || port < 1 || port > 65535 {
		return "", "", fmt.Errorf("invalid PgBouncer port")
	}
	poolerAddress := net.JoinHostPort(poolerHost, strconv.Itoa(port))
	escapeCredential := func(value string) string { return strings.ReplaceAll(url.QueryEscape(value), "+", "%20") }
	runtimeURL := direct.Scheme + "://" + escapeCredential(runtimeUser) + ":" + escapeCredential(runtimePassword) + "@" + poolerAddress + direct.EscapedPath() + "?sslmode=disable"
	return runtimeURL, migration, nil
}

func validatePgBouncerUpstream(directURL, upstreamHost, upstreamPort string) error {
	direct, err := url.Parse(strings.TrimSpace(directURL))
	if err != nil || direct.Hostname() == "" {
		return errors.New("invalid direct database endpoint")
	}
	if upstreamHost == "" || !poolerHostPattern.MatchString(upstreamHost) {
		return errors.New("invalid PgBouncer upstream host")
	}
	directPort := direct.Port()
	if directPort == "" {
		directPort = "5432"
	}
	if upstreamPort == "" {
		upstreamPort = "5432"
	}
	parsedDirectPort, directPortErr := strconv.Atoi(directPort)
	parsedUpstreamPort, upstreamPortErr := strconv.Atoi(upstreamPort)
	if directPortErr != nil || parsedDirectPort < 1 || parsedDirectPort > 65535 || upstreamPortErr != nil || parsedUpstreamPort < 1 || parsedUpstreamPort > 65535 {
		return errors.New("invalid PgBouncer upstream port")
	}
	if !strings.EqualFold(strings.TrimSuffix(direct.Hostname(), "."), strings.TrimSuffix(upstreamHost, ".")) || directPort != upstreamPort {
		return fmt.Errorf("PgBouncer upstream %s:%s does not match direct database endpoint %s:%s", upstreamHost, upstreamPort, direct.Hostname(), directPort)
	}
	return nil
}

func validateTenantDatabaseAdminURL(directURL, adminURL string) error {
	direct, err := url.Parse(strings.TrimSpace(directURL))
	if err != nil || (direct.Scheme != "postgres" && direct.Scheme != "postgresql") || direct.Hostname() == "" {
		return errors.New("invalid direct tenant database URL")
	}
	admin, err := url.Parse(strings.TrimSpace(adminURL))
	if err != nil || (admin.Scheme != "postgres" && admin.Scheme != "postgresql") || admin.Hostname() == "" || admin.User == nil || admin.User.Username() == "" {
		return errors.New("TENANT_DATABASE_ADMIN_URL must be an authenticated PostgreSQL endpoint")
	}
	directPort, adminPort := direct.Port(), admin.Port()
	if directPort == "" {
		directPort = "5432"
	}
	if adminPort == "" {
		adminPort = "5432"
	}
	if !strings.EqualFold(strings.TrimSuffix(direct.Hostname(), "."), strings.TrimSuffix(admin.Hostname(), ".")) || directPort != adminPort {
		return fmt.Errorf("tenant admin endpoint %s:%s does not match direct database endpoint %s:%s", admin.Hostname(), adminPort, direct.Hostname(), directPort)
	}
	return nil
}

func encryptTenantDBPassword(password, key string) (string, error) {
	block, err := aes.NewCipher([]byte(key))
	if err != nil {
		return "", fmt.Errorf("tenant encryption key must be 32 bytes: %w", err)
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", err
	}
	return base64.RawStdEncoding.EncodeToString(append(nonce, gcm.Seal(nil, nonce, []byte(password), nil)...)), nil
}

func decryptTenantDBPassword(ciphertext, key string) (string, error) {
	block, err := aes.NewCipher([]byte(key))
	if err != nil {
		return "", fmt.Errorf("tenant encryption key must be 32 bytes: %w", err)
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	data, err := base64.RawStdEncoding.DecodeString(ciphertext)
	if err != nil || len(data) < gcm.NonceSize() {
		return "", errors.New("invalid encrypted tenant database password")
	}
	plain, err := gcm.Open(nil, data[:gcm.NonceSize()], data[gcm.NonceSize():], nil)
	if err != nil {
		return "", errors.New("unable to decrypt tenant database password")
	}
	return string(plain), nil
}

func (o *Orchestrator) tenantRuntimeCredentials(slug string) (string, string, error) {
	var user, ciphertext string
	if err := o.masterDB.QueryRow(`SELECT tenant_db_runtime_user, tenant_db_runtime_password_ciphertext FROM servers WHERE slug=$1`, slug).Scan(&user, &ciphertext); err != nil {
		return "", "", err
	}
	password, err := decryptTenantDBPassword(ciphertext, os.Getenv("TENANT_DB_ENCRYPTION_KEY"))
	if err != nil {
		return "", "", fmt.Errorf("decrypt tenant database password: %w", err)
	}
	return user, password, nil
}

func (o *Orchestrator) syncPgBouncerAuth(ctx context.Context) error {
	return o.syncPgBouncerAuthExcluding(ctx, "")
}

func (o *Orchestrator) syncPgBouncerAuthExcluding(ctx context.Context, excludedSlug string) error {
	if !pgbouncerEnabled() {
		return nil
	}
	key := os.Getenv("TENANT_DB_ENCRYPTION_KEY")
	adminPassword := os.Getenv("PGBOUNCER_ADMIN_PASSWORD")
	if len(key) != 32 {
		return errors.New("TENANT_DB_ENCRYPTION_KEY must contain exactly 32 bytes")
	}
	if err := validatePgBouncerAdminPassword(adminPassword); err != nil {
		return err
	}
	rows, err := o.masterDB.QueryContext(ctx, `SELECT slug, tenant_db_runtime_user, tenant_db_runtime_password_ciphertext FROM servers WHERE tenant_db_runtime_user IS NOT NULL AND tenant_db_runtime_password_ciphertext IS NOT NULL AND ($1 = '' OR slug <> $1)`, excludedSlug)
	if err != nil {
		return err
	}
	users := map[string]string{"pgbouncer_admin": adminPassword}
	for rows.Next() {
		var slug, user, ciphertext string
		if err := rows.Scan(&slug, &user, &ciphertext); err != nil {
			_ = rows.Close()
			return err
		}
		password, err := decryptTenantDBPassword(ciphertext, key)
		if err != nil {
			_ = rows.Close()
			return fmt.Errorf("decrypt database password for Space %s: %w", slug, err)
		}
		users[user] = password
	}
	if err := rows.Err(); err != nil {
		_ = rows.Close()
		return err
	}
	if err := rows.Close(); err != nil {
		return err
	}
	contents, err := renderPgBouncerAuthFile(users)
	if err != nil {
		return err
	}
	path := os.Getenv("PGBOUNCER_AUTH_FILE")
	if path == "" {
		path = "/var/run/pgbouncer-auth/userlist.txt"
	}
	if err := writePgBouncerAuthFile(path, contents); err != nil {
		return err
	}
	adminDSN := url.URL{Scheme: "postgres", User: url.UserPassword("pgbouncer_admin", adminPassword), Host: net.JoinHostPort(envOr("PGBOUNCER_HOST", "pgbouncer"), envOr("PGBOUNCER_PORT", "6432")), Path: "/pgbouncer", RawQuery: "sslmode=disable"}
	adminURL := adminDSN.String()
	adminDB, err := sql.Open("pgx", adminURL)
	if err != nil {
		return err
	}
	defer func() { _ = adminDB.Close() }()
	if err := adminDB.PingContext(ctx); err != nil {
		return fmt.Errorf("connect to PgBouncer admin console: %w", err)
	}
	if _, err := adminDB.ExecContext(ctx, "RELOAD"); err != nil {
		return fmt.Errorf("reload PgBouncer auth file: %w", err)
	}
	return nil
}

func envOr(key, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(key)); value != "" {
		return value
	}
	return fallback
}

func (o *Orchestrator) openTenantAdminDB() (*sql.DB, error) {
	adminURL := strings.TrimSpace(os.Getenv("TENANT_DATABASE_ADMIN_URL"))
	configuredDirectURL := strings.TrimSpace(os.Getenv("DATABASE_URL"))
	directURL := configuredDirectURL
	if directURL == "" {
		directURL = "postgres://postgres@" + net.JoinHostPort(envOr("POSTGRES_HOST", "postgres"), envOr("POSTGRES_PORT", "5432")) + "/stovo_db_{slug}?sslmode=disable"
	}
	if adminURL != "" {
		if err := validateTenantDatabaseAdminURL(directURL, adminURL); err != nil {
			return nil, err
		}
	}
	if pgbouncerEnabled() {
		if err := validatePgBouncerUpstream(directURL, envOr("PGBOUNCER_UPSTREAM_HOST", "postgres"), envOr("PGBOUNCER_UPSTREAM_PORT", "5432")); err != nil {
			return nil, err
		}
	}
	if adminURL == "" {
		if configuredDirectURL != "" {
			parsed, err := url.Parse(directURL)
			if err != nil || parsed.Host == "" || parsed.User == nil || parsed.User.Username() == "" {
				return nil, errors.New("external DATABASE_URL must include an authenticated PostgreSQL endpoint")
			}
			parsed.Path = "/postgres"
			adminURL = parsed.String()
		} else {
			user, password := os.Getenv("POSTGRES_USER"), os.Getenv("POSTGRES_PASSWORD")
			if user == "" || password == "" {
				return nil, errors.New("local PostgreSQL admin credentials are missing")
			}
			host, port := envOr("POSTGRES_HOST", "postgres"), envOr("POSTGRES_PORT", "5432")
			adminURL = "postgres://" + url.UserPassword(user, password).String() + "@" + net.JoinHostPort(host, port) + "/postgres?sslmode=disable"
		}
	}
	db, err := sql.Open("pgx", adminURL)
	if err != nil {
		return nil, err
	}
	if err := db.Ping(); err != nil {
		_ = db.Close()
		return nil, err
	}
	return db, nil
}

func (o *Orchestrator) dropTenantDatabase(slug string) error {
	if !tenantSlugPattern.MatchString(slug) {
		return errors.New("invalid tenant slug")
	}
	db, err := o.openTenantAdminDB()
	if err != nil {
		return err
	}
	defer func() { _ = db.Close() }()
	dbName, role := "stovo_db_"+slug, "stovo_runtime_"+slug
	_, _ = db.Exec(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()`, dbName)
	if _, err := db.Exec("DROP DATABASE IF EXISTS " + quotePostgresIdentifier(dbName)); err != nil {
		return fmt.Errorf("drop tenant database: %w", err)
	}
	if _, err := db.Exec("DROP ROLE IF EXISTS " + quotePostgresIdentifier(role)); err != nil {
		return fmt.Errorf("drop tenant role: %w", err)
	}
	return nil
}

func (o *Orchestrator) ensureTenantCredentials(slug string) error {
	var runtimeUser, ciphertext string
	err := o.masterDB.QueryRow(`SELECT COALESCE(tenant_db_runtime_user,''), COALESCE(tenant_db_runtime_password_ciphertext,'') FROM servers WHERE slug=$1`, slug).Scan(&runtimeUser, &ciphertext)
	if err != nil {
		return err
	}
	if runtimeUser != "" && ciphertext != "" {
		return nil
	}
	key := os.Getenv("TENANT_DB_ENCRYPTION_KEY")
	if len(key) != 32 {
		return errors.New("TENANT_DB_ENCRYPTION_KEY must contain exactly 32 bytes")
	}
	password := uuid.NewString() + uuid.NewString()
	adminDB, err := o.openTenantAdminDB()
	if err != nil {
		return err
	}
	err = provisionTenantDatabase(context.Background(), adminDB, slug, password)
	_ = adminDB.Close()
	if err != nil {
		return err
	}
	ciphertext, err = encryptTenantDBPassword(password, key)
	if err != nil {
		return err
	}
	runtimeUser = "stovo_runtime_" + slug
	if _, err := o.masterDB.Exec(`UPDATE servers SET tenant_db_runtime_user=$1, tenant_db_runtime_password_ciphertext=$2 WHERE slug=$3`, runtimeUser, ciphertext, slug); err != nil {
		return err
	}
	return o.syncPgBouncerAuth(context.Background())
}

func provisionTenantDatabase(ctx context.Context, adminDB *sql.DB, slug, runtimePassword string) error {
	if adminDB == nil || !tenantSlugPattern.MatchString(slug) || !validTenantRuntimePassword(runtimePassword) {
		return errors.New("invalid tenant database provisioning input")
	}
	role, db := "stovo_runtime_"+slug, "stovo_db_"+slug
	passwordLiteral := "'" + runtimePassword + "'"
	if _, err := adminDB.ExecContext(ctx, "CREATE ROLE "+quotePostgresIdentifier(role)+" LOGIN PASSWORD "+passwordLiteral); err != nil {
		// Reconcile an interrupted create while still rotating to the new password.
		if _, alterErr := adminDB.ExecContext(ctx, "ALTER ROLE "+quotePostgresIdentifier(role)+" WITH LOGIN PASSWORD "+passwordLiteral); alterErr != nil {
			return fmt.Errorf("create tenant runtime role: %w", err)
		}
	}
	if _, err := adminDB.ExecContext(ctx, "CREATE DATABASE "+quotePostgresIdentifier(db)); err != nil {
		var exists bool
		if scanErr := adminDB.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname=$1)`, db).Scan(&exists); scanErr != nil || !exists {
			return fmt.Errorf("create tenant database: %w", err)
		}
	}
	if _, err := adminDB.ExecContext(ctx, "REVOKE ALL ON DATABASE "+quotePostgresIdentifier(db)+" FROM PUBLIC"); err != nil {
		return err
	}
	if _, err := adminDB.ExecContext(ctx, "GRANT CONNECT, TEMPORARY ON DATABASE "+quotePostgresIdentifier(db)+" TO "+quotePostgresIdentifier(role)); err != nil {
		return err
	}
	return nil
}
