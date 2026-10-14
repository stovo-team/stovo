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
	"stovo-messenger/backend/internal/app"
	"stovo-messenger/backend/internal/config"
)

type coordinator interface {
	RegisterIntelligenceSourceV2BackupHorizon(context.Context, string, time.Time, time.Time) error
	MarkIntelligenceSourceV2BackupInventoryVerified(context.Context, time.Time) error
	BeginIntelligenceSourceV2Restore(context.Context, string, time.Time) ([]app.IntelligenceSourceV2RestoreTombstone, error)
	CompleteIntelligenceSourceV2Restore(context.Context, string, map[string]int64, time.Time) error
}

type operationResult struct {
	OK bool `json:"ok"`
}

type restoreBeginResult struct {
	Tombstones []app.IntelligenceSourceV2RestoreTombstone `json:"tombstones"`
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
	operations := app.NewIntelligenceSourceV2Operations(db, cfg.IntelligenceSourceV2RestoreEpoch)
	return run(operationCtx, os.Args[1:], os.Stdin, os.Stdout, os.Stderr, operations)
}

func run(ctx context.Context, args []string, stdin io.Reader, stdout, stderr io.Writer, operations coordinator) int {
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

	case args[0] == "restore" && args[1] == "begin":
		values, ok := parseExactFlags(args[2:], "restore-id", "backup-created-at")
		if !ok {
			return writeFailure(stderr, "invalid arguments", 2)
		}
		backupCreatedAt, ok := parseUTCTimestamp(values["backup-created-at"])
		if !ok {
			return writeFailure(stderr, "invalid timestamp", 2)
		}
		tombstones, err := operations.BeginIntelligenceSourceV2Restore(ctx, values["restore-id"], backupCreatedAt)
		if err != nil {
			return writeFailure(stderr, "operation failed", 1)
		}
		if tombstones == nil {
			tombstones = []app.IntelligenceSourceV2RestoreTombstone{}
		}
		return writeJSON(stdout, stderr, restoreBeginResult{Tombstones: tombstones})

	case args[0] == "restore" && args[1] == "complete":
		values, ok := parseExactFlags(args[2:], "restore-id", "ledger-checked-at")
		if !ok {
			return writeFailure(stderr, "invalid arguments", 2)
		}
		checkedAt, ok := parseUTCTimestamp(values["ledger-checked-at"])
		if !ok {
			return writeFailure(stderr, "invalid timestamp", 2)
		}
		appliedThrough, ok := decodeWatermarks(stdin)
		if !ok {
			return writeFailure(stderr, "invalid watermark JSON", 2)
		}
		if err := operations.CompleteIntelligenceSourceV2Restore(ctx, values["restore-id"], appliedThrough, checkedAt); err != nil {
			return writeFailure(stderr, "operation failed", 1)
		}
		return writeJSON(stdout, stderr, operationResult{OK: true})

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

func decodeWatermarks(reader io.Reader) (map[string]int64, bool) {
	if reader == nil {
		return nil, false
	}
	decoder := json.NewDecoder(reader)
	var watermarks map[string]int64
	if err := decoder.Decode(&watermarks); err != nil || watermarks == nil {
		return nil, false
	}
	for connectionID, sequence := range watermarks {
		if strings.TrimSpace(connectionID) == "" || sequence < 0 {
			return nil, false
		}
	}
	var trailing any
	if err := decoder.Decode(&trailing); err != io.EOF {
		return nil, false
	}
	return watermarks, true
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
