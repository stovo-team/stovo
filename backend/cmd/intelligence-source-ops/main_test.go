package main

import (
	"bytes"
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"stovo-messenger/backend/internal/app"
)

type backupRegistration struct {
	id        string
	createdAt time.Time
	until     time.Time
}

type restoreBegin struct {
	id        string
	createdAt time.Time
}

type restoreCompletion struct {
	id             string
	appliedThrough map[string]int64
	checkedAt      time.Time
}

type fakeCoordinator struct {
	registrations []backupRegistration
	verifiedAt    []time.Time
	begins        []restoreBegin
	completions   []restoreCompletion
	tombstones    []app.IntelligenceSourceV2RestoreTombstone
	err           error
}

func (f *fakeCoordinator) RegisterIntelligenceSourceV2BackupHorizon(_ context.Context, id string, createdAt, until time.Time) error {
	f.registrations = append(f.registrations, backupRegistration{id: id, createdAt: createdAt, until: until})
	return f.err
}

func (f *fakeCoordinator) MarkIntelligenceSourceV2BackupInventoryVerified(_ context.Context, verifiedAt time.Time) error {
	f.verifiedAt = append(f.verifiedAt, verifiedAt)
	return f.err
}

func (f *fakeCoordinator) BeginIntelligenceSourceV2Restore(_ context.Context, id string, createdAt time.Time) ([]app.IntelligenceSourceV2RestoreTombstone, error) {
	f.begins = append(f.begins, restoreBegin{id: id, createdAt: createdAt})
	return f.tombstones, f.err
}

func (f *fakeCoordinator) CompleteIntelligenceSourceV2Restore(_ context.Context, id string, appliedThrough map[string]int64, checkedAt time.Time) error {
	watermarks := make(map[string]int64, len(appliedThrough))
	for connectionID, sequence := range appliedThrough {
		watermarks[connectionID] = sequence
	}
	f.completions = append(f.completions, restoreCompletion{id: id, appliedThrough: watermarks, checkedAt: checkedAt})
	return f.err
}

func TestRunBackupRegisterParsesUTCAndDispatches(t *testing.T) {
	coordinator := &fakeCoordinator{}
	var stdout, stderr bytes.Buffer
	code := run(context.Background(), []string{"backup", "register", "--backup-id", "backup-42", "--created-at", "2026-10-14T08:00:00Z", "--restorable-until", "2026-11-13T08:00:00Z"}, strings.NewReader(""), &stdout, &stderr, coordinator)
	if code != 0 {
		t.Fatalf("run returned %d, stderr=%q", code, stderr.String())
	}
	if got, want := len(coordinator.registrations), 1; got != want {
		t.Fatalf("registration calls = %d, want %d", got, want)
	}
	call := coordinator.registrations[0]
	if call.id != "backup-42" || !call.createdAt.Equal(time.Date(2026, 10, 14, 8, 0, 0, 0, time.UTC)) || !call.until.Equal(time.Date(2026, 11, 13, 8, 0, 0, 0, time.UTC)) {
		t.Fatalf("registration call = %#v", call)
	}
	if got := strings.TrimSpace(stdout.String()); got != `{"ok":true}` {
		t.Fatalf("stdout = %q, want success JSON", got)
	}
}

func TestRunInventoryVerifyParsesUTCAndDispatches(t *testing.T) {
	coordinator := &fakeCoordinator{}
	var stdout, stderr bytes.Buffer
	code := run(context.Background(), []string{"inventory", "verify", "--verified-at", "2026-10-14T08:00:00Z"}, strings.NewReader(""), &stdout, &stderr, coordinator)
	if code != 0 || len(coordinator.verifiedAt) != 1 || !coordinator.verifiedAt[0].Equal(time.Date(2026, 10, 14, 8, 0, 0, 0, time.UTC)) {
		t.Fatalf("run code=%d verified_at=%v stderr=%q", code, coordinator.verifiedAt, stderr.String())
	}
	if got := strings.TrimSpace(stdout.String()); got != `{"ok":true}` {
		t.Fatalf("stdout = %q, want success JSON", got)
	}
}

func TestRunInventoryVerifyRejectsInvalidTimestamp(t *testing.T) {
	coordinator := &fakeCoordinator{}
	var stdout, stderr bytes.Buffer
	code := run(context.Background(), []string{"inventory", "verify", "--verified-at", "2026-10-14T08:00:00+00:00"}, strings.NewReader(""), &stdout, &stderr, coordinator)
	if code == 0 || len(coordinator.verifiedAt) != 0 || stdout.Len() != 0 {
		t.Fatalf("invalid timestamp accepted: code=%d verified_at=%v stdout=%q stderr=%q", code, coordinator.verifiedAt, stdout.String(), stderr.String())
	}
}

func TestRunRestoreBeginWritesMetadataJSON(t *testing.T) {
	coordinator := &fakeCoordinator{tombstones: []app.IntelligenceSourceV2RestoreTombstone{{
		EventID: "event-1", ConnectionID: "connection-1", ResourceID: "resource-1", RevisionID: "revision-1", ChatID: "chat-1", Sequence: 7, Reason: "message_deleted", CreatedAt: time.Date(2026, 10, 14, 8, 0, 0, 0, time.UTC),
	}}}
	var stdout, stderr bytes.Buffer
	code := run(context.Background(), []string{"restore", "begin", "--restore-id", "restore-9", "--backup-created-at", "2026-10-14T08:00:00Z"}, strings.NewReader(""), &stdout, &stderr, coordinator)
	if code != 0 || len(coordinator.begins) != 1 {
		t.Fatalf("run code=%d begin calls=%d stderr=%q", code, len(coordinator.begins), stderr.String())
	}
	if got, want := coordinator.begins[0], (restoreBegin{id: "restore-9", createdAt: time.Date(2026, 10, 14, 8, 0, 0, 0, time.UTC)}); got != want {
		t.Fatalf("begin call = %#v, want %#v", got, want)
	}
	const want = `{"tombstones":[{"event_id":"event-1","connection_id":"connection-1","resource_id":"resource-1","revision_id":"revision-1","chat_id":"chat-1","sequence":7,"reason":"message_deleted","created_at":"2026-10-14T08:00:00Z"}]}`
	if got := strings.TrimSpace(stdout.String()); got != want {
		t.Fatalf("stdout = %q, want metadata-only tombstones", got)
	}
}

func TestRunRestoreCompleteReadsWatermarksFromStdin(t *testing.T) {
	coordinator := &fakeCoordinator{}
	var stdout, stderr bytes.Buffer
	code := run(context.Background(), []string{"restore", "complete", "--restore-id", "restore-9", "--ledger-checked-at", "2026-10-14T08:00:00Z"}, strings.NewReader(`{"connection-1":7,"connection-2":13}`), &stdout, &stderr, coordinator)
	if code != 0 || len(coordinator.completions) != 1 {
		t.Fatalf("run code=%d completion calls=%d stderr=%q", code, len(coordinator.completions), stderr.String())
	}
	call := coordinator.completions[0]
	if call.id != "restore-9" || !call.checkedAt.Equal(time.Date(2026, 10, 14, 8, 0, 0, 0, time.UTC)) || len(call.appliedThrough) != 2 || call.appliedThrough["connection-1"] != 7 || call.appliedThrough["connection-2"] != 13 {
		t.Fatalf("completion call = %#v", call)
	}
	if got := strings.TrimSpace(stdout.String()); got != `{"ok":true}` {
		t.Fatalf("stdout = %q, want success JSON", got)
	}
}

func TestRunRejectsMalformedArgumentsAndJSON(t *testing.T) {
	cases := []struct {
		name  string
		args  []string
		input string
	}{
		{name: "unknown command", args: []string{"restore", "finish"}},
		{name: "missing required flag", args: []string{"inventory", "verify"}},
		{name: "unexpected flag", args: []string{"inventory", "verify", "--verified-at", "2026-10-14T08:00:00Z", "--extra", "secret"}},
		{name: "malformed JSON", args: []string{"restore", "complete", "--restore-id", "restore-1", "--ledger-checked-at", "2026-10-14T08:00:00Z"}, input: `{"connection-1":`},
		{name: "multiple JSON values", args: []string{"restore", "complete", "--restore-id", "restore-1", "--ledger-checked-at", "2026-10-14T08:00:00Z"}, input: `{"connection-1":7}{"connection-2":8}`},
		{name: "JSON is not an object", args: []string{"restore", "complete", "--restore-id", "restore-1", "--ledger-checked-at", "2026-10-14T08:00:00Z"}, input: `[]`},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			coordinator := &fakeCoordinator{}
			var stdout, stderr bytes.Buffer
			if code := run(context.Background(), tc.args, strings.NewReader(tc.input), &stdout, &stderr, coordinator); code == 0 {
				t.Fatalf("malformed input accepted: stdout=%q stderr=%q", stdout.String(), stderr.String())
			}
			if stdout.Len() != 0 {
				t.Fatalf("malformed input emitted stdout: %q", stdout.String())
			}
		})
	}
}

func TestRunCoordinatorErrorsDoNotLeakSensitiveData(t *testing.T) {
	const sensitiveMarker = "db-password-and-private-payload-marker"
	coordinator := &fakeCoordinator{err: errors.New("database unavailable: " + sensitiveMarker)}
	var stdout, stderr bytes.Buffer
	code := run(context.Background(), []string{"inventory", "verify", "--verified-at", "2026-10-14T08:00:00Z"}, strings.NewReader(""), &stdout, &stderr, coordinator)
	if code == 0 {
		t.Fatalf("coordinator error returned success: stdout=%q stderr=%q", stdout.String(), stderr.String())
	}
	if strings.Contains(stdout.String()+stderr.String(), sensitiveMarker) || stdout.Len() != 0 {
		t.Fatalf("coordinator error leaked sensitive data: stdout=%q stderr=%q", stdout.String(), stderr.String())
	}
}
