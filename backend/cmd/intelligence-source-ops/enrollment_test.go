package main

import (
	"bytes"
	"context"
	"strings"
	"testing"
)

func TestEnrollmentRejectsMissingIssuerAndMalformedArgumentsWithoutEchoingThem(t *testing.T) {
	tests := []struct {
		args   []string
		issuer string
	}{
		{[]string{"--family-id", "family", "--tenant-id", "tenant", "--user-id", "private-user"}, ""},
		{[]string{"--family-id", "family", "--tenant-id", "tenant", "--user-id", "private-user", "--issuer", "https://attacker.example"}, "https://messenger.example"},
		{[]string{"--family-id", "family", "--tenant-id", "tenant", "--user-id", "private-user"}, "https://messenger.example/path"},
	}
	for _, tc := range tests {
		var stdout, stderr bytes.Buffer
		if code := runEnrollment(context.Background(), tc.args, &stdout, &stderr, nil, tc.issuer); code == 0 || stdout.Len() != 0 || strings.Contains(stderr.String(), "private-user") {
			t.Fatalf("invalid enrollment accepted or leaked input: code=%d stdout=%q stderr=%q", code, stdout.String(), stderr.String())
		}
	}
}
