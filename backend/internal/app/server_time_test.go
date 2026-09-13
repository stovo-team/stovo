package app

import (
	"testing"
	"time"
)

func TestParseTimeAcceptsPersistedPostgresTimestamp(t *testing.T) {
	want := time.Date(2026, time.September, 13, 12, 50, 21, 123456000, time.UTC)
	got := parseTime("2026-09-13 12:50:21.123456+00")
	if !got.Equal(want) {
		t.Fatalf("parseTime() = %s, want %s", got, want)
	}
}

func TestParseTimeAcceptsPostgresTimestampWithZoneName(t *testing.T) {
	want := time.Date(2026, time.September, 13, 12, 50, 21, 0, time.UTC)
	got := parseTime("2026-09-13 12:50:21 +0000 UTC")
	if !got.Equal(want) {
		t.Fatalf("parseTime() = %s, want %s", got, want)
	}
}
