package orchestrator

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"time"
)

func grantTenantRuntimePrivileges(databaseURL, runtimeUser string) error {
	parsed, err := url.Parse(databaseURL)
	if err != nil || parsed.Host == "" || parsed.User == nil || parsed.User.Username() == "" {
		return errors.New("migration database URL must include direct admin credentials")
	}
	runtimeRole := quotePostgresIdentifier(runtimeUser)
	db, err := sql.Open("pgx", databaseURL)
	if err != nil {
		return err
	}
	defer func() { _ = db.Close() }()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := db.PingContext(ctx); err != nil {
		return err
	}
	statements := []string{
		"GRANT USAGE ON SCHEMA public TO " + runtimeRole,
		"GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO " + runtimeRole,
		"GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO " + runtimeRole,
		"ALTER DEFAULT PRIVILEGES FOR ROLE " + quotePostgresIdentifier(parsed.User.Username()) + " IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO " + runtimeRole,
		"ALTER DEFAULT PRIVILEGES FOR ROLE " + quotePostgresIdentifier(parsed.User.Username()) + " IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO " + runtimeRole,
	}
	for _, statement := range statements {
		if _, err := db.ExecContext(ctx, statement); err != nil {
			return fmt.Errorf("grant tenant runtime privileges: %w", err)
		}
	}
	return nil
}

func writePgBouncerAuthFile(path string, contents string) error {
	return writePgBouncerAuthFileForUID(path, contents, 70)
}

func writePgBouncerAuthFileForUID(path string, contents string, ownerUID int) error {
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0700); err != nil {
		return fmt.Errorf("create PgBouncer auth directory: %w", err)
	}
	if err := os.Chown(dir, ownerUID, ownerUID); err != nil {
		return fmt.Errorf("set PgBouncer auth directory ownership: %w", err)
	}
	tmp, err := os.CreateTemp(dir, ".userlist-*")
	if err != nil {
		return fmt.Errorf("create temporary PgBouncer auth file: %w", err)
	}
	tmpPath := tmp.Name()
	defer func() { _ = os.Remove(tmpPath) }()
	if err := tmp.Chmod(0600); err != nil {
		_ = tmp.Close()
		return err
	}
	if _, err := tmp.WriteString(contents); err != nil {
		_ = tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	if err := os.Chown(tmpPath, ownerUID, ownerUID); err != nil {
		return fmt.Errorf("set PgBouncer auth file ownership: %w", err)
	}
	if err := os.Rename(tmpPath, path); err != nil {
		return fmt.Errorf("replace PgBouncer auth file: %w", err)
	}
	return nil
}
