package app

import (
	"testing"
)

func TestNormalizeDomainInvalidInputUsesLowercaseError(t *testing.T) {
	_, err := normalizeDomain("invalid")
	if err == nil {
		t.Fatal("expected invalid domain to be rejected")
	}
	if err.Error() != "invalid domain" {
		t.Fatalf("error = %q, want %q", err, "invalid domain")
	}
}

func TestNormalizeDomainAcceptsValidHostname(t *testing.T) {
	got, err := normalizeDomain("https://Chat.Example.com/path")
	if err != nil {
		t.Fatalf("normalizeDomain returned error: %v", err)
	}
	if got != "chat.example.com" {
		t.Fatalf("normalizeDomain = %q, want %q", got, "chat.example.com")
	}
}
