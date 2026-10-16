package main

import (
	"bytes"
	"context"
	"errors"
	"strings"
	"testing"
	"time"
)

type backupRegistration struct {
	id        string
	createdAt time.Time
	until     time.Time
}

type fakeCoordinator struct {
	registrations []backupRegistration
	verifiedAt    []time.Time
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

func TestRunRestoreOperationsRequireIndependentProof(t *testing.T) {
	coordinator := &fakeCoordinator{}
	cases := [][]string{
		{"restore", "begin", "--restore-id", "restore-9", "--backup-created-at", "2026-10-14T08:00:00Z"},
		{"restore", "complete", "--restore-id", "restore-9", "--ledger-checked-at", "2026-10-14T08:00:00Z"},
	}
	for _, args := range cases {
		var stdout, stderr bytes.Buffer
		code := run(context.Background(), args, strings.NewReader(`{"connection-1":7}`), &stdout, &stderr, coordinator)
		if code == 0 || stdout.Len() != 0 || !strings.Contains(stderr.String(), "independent proof") {
			t.Fatalf("restore command was not rejected safely: args=%v code=%d stdout=%q stderr=%q", args, code, stdout.String(), stderr.String())
		}
	}
	if len(coordinator.registrations) != 0 || len(coordinator.verifiedAt) != 0 {
		t.Fatalf("restore command invoked backup coordinator: registrations=%v verifications=%v", coordinator.registrations, coordinator.verifiedAt)
	}
}

func TestRunRejectsMalformedArguments(t *testing.T) {
	cases := []struct {
		name string
		args []string
	}{
		{name: "unknown command", args: []string{"backup", "unknown"}},
		{name: "missing required flag", args: []string{"inventory", "verify"}},
		{name: "unexpected flag", args: []string{"inventory", "verify", "--verified-at", "2026-10-14T08:00:00Z", "--extra", "secret"}},
		{name: "incomplete restore command", args: []string{"restore"}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			coordinator := &fakeCoordinator{}
			var stdout, stderr bytes.Buffer
			if code := run(context.Background(), tc.args, strings.NewReader(""), &stdout, &stderr, coordinator); code == 0 {
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
