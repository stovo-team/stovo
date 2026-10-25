package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"io"
	"os"
	"strings"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"
	adapterintelligencesourcev2 "stovo-messenger/backend/internal/adapters/intelligencesourcev2"
	"stovo-messenger/backend/internal/app"
	"stovo-messenger/backend/internal/config"
)

type coordinator interface {
	RegisterIntelligenceSourceV2BackupHorizon(context.Context, string, time.Time, time.Time) error
	MarkIntelligenceSourceV2BackupInventoryVerified(context.Context, time.Time) error
}

type operationResult struct {
	OK bool `json:"ok"`
}

func main() {
	os.Exit(runMain())
}

func runMain() int {
	cfg, err := config.Load()
	if err != nil {
		return writeFailure(os.Stderr, "configuration unavailable", 2)
	}
	db, err := sql.Open("pgx", cfg.EffectiveDatabaseURL())
	if err != nil {
		return writeFailure(os.Stderr, "database connection failed", 1)
	}
	defer func() { _ = db.Close() }()

	pingCtx, cancelPing := context.WithTimeout(context.Background(), 10*time.Second)
	err = db.PingContext(pingCtx)
	cancelPing()
	if err != nil {
		return writeFailure(os.Stderr, "database connection failed", 1)
	}

	operationCtx, cancelOperation := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancelOperation()
	operations := app.NewIntelligenceSourceV2Operations(adapterintelligencesourcev2.NewPostgresStore(db))
	return run(operationCtx, os.Args[1:], os.Stdin, os.Stdout, os.Stderr, operations)
}

func run(ctx context.Context, args []string, _ io.Reader, stdout, stderr io.Writer, operations coordinator) int {
	if operations == nil || len(args) < 2 {
		return writeFailure(stderr, "invalid command", 2)
	}

	switch {
	case args[0] == "backup" && args[1] == "register":
		values, ok := parseExactFlags(args[2:], "backup-id", "created-at", "restorable-until")
		if !ok {
			return writeFailure(stderr, "invalid arguments", 2)
		}
		createdAt, ok := parseUTCTimestamp(values["created-at"])
		if !ok {
			return writeFailure(stderr, "invalid timestamp", 2)
		}
		restorableUntil, ok := parseUTCTimestamp(values["restorable-until"])
		if !ok {
			return writeFailure(stderr, "invalid timestamp", 2)
		}
		if err := operations.RegisterIntelligenceSourceV2BackupHorizon(ctx, values["backup-id"], createdAt, restorableUntil); err != nil {
			return writeFailure(stderr, "operation failed", 1)
		}
		return writeJSON(stdout, stderr, operationResult{OK: true})

	case args[0] == "inventory" && args[1] == "verify":
		values, ok := parseExactFlags(args[2:], "verified-at")
		if !ok {
			return writeFailure(stderr, "invalid arguments", 2)
		}
		verifiedAt, ok := parseUTCTimestamp(values["verified-at"])
		if !ok {
			return writeFailure(stderr, "invalid timestamp", 2)
		}
		if err := operations.MarkIntelligenceSourceV2BackupInventoryVerified(ctx, verifiedAt); err != nil {
			return writeFailure(stderr, "operation failed", 1)
		}
		return writeJSON(stdout, stderr, operationResult{OK: true})

	case args[0] == "restore":
		return writeFailure(stderr, "restore operations unavailable until independent proof is integrated", 1)

	default:
		return writeFailure(stderr, "invalid command", 2)
	}
}

func parseExactFlags(args []string, required ...string) (map[string]string, bool) {
	allowed := make(map[string]struct{}, len(required))
	for _, name := range required {
		allowed[name] = struct{}{}
	}
	values := make(map[string]string, len(required))
	for index := 0; index < len(args); {
		flag := args[index]
		if !strings.HasPrefix(flag, "--") || len(flag) == 2 || index+1 >= len(args) {
			return nil, false
		}
		name := flag[2:]
		if _, ok := allowed[name]; !ok {
			return nil, false
		}
		if _, duplicate := values[name]; duplicate {
			return nil, false
		}
		value := args[index+1]
		if value == "" || strings.HasPrefix(value, "--") {
			return nil, false
		}
		values[name] = value
		index += 2
	}
	if len(values) != len(required) {
		return nil, false
	}
	return values, true
}

func parseUTCTimestamp(raw string) (time.Time, bool) {
	if !strings.HasSuffix(raw, "Z") {
		return time.Time{}, false
	}
	parsed, err := time.Parse(time.RFC3339, raw)
	if err != nil {
		return time.Time{}, false
	}
	return parsed.UTC(), true
}

func writeJSON(stdout, stderr io.Writer, value any) int {
	if err := json.NewEncoder(stdout).Encode(value); err != nil {
		return writeFailure(stderr, "output failed", 1)
	}
	return 0
}

func writeFailure(stderr io.Writer, message string, code int) int {
	_, _ = io.WriteString(stderr, message+"\n")
	return code
}
