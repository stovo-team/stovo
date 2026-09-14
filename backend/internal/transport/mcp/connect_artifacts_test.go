package mcp

import (
	"strings"
	"testing"
)

func TestBuildConnectArtifactsPreservesClientSpecificContracts(t *testing.T) {
	artifacts := BuildConnectArtifacts("https://stovo.test/mcp", "codex", "api", "codex", "Stovo", "token")
	if artifacts.URL != "https://stovo.test/mcp" {
		t.Fatalf("URL = %q", artifacts.URL)
	}
	if artifacts.CLICommand != `codex mcp add stovo --url https://stovo.test/mcp --header "Authorization: Bearer token"` {
		t.Fatalf("unexpected command: %q", artifacts.CLICommand)
	}
	if artifacts.SetupPrompt == "" {
		t.Fatal("setup prompt is empty")
	}
	if !strings.Contains(artifacts.SetupPrompt, `"Stovo"`) {
		t.Fatalf("expected prompt to contain connection name: %s", artifacts.SetupPrompt)
	}
	if !strings.Contains(artifacts.SetupPrompt, "This URL is bound to one Stovo Space") || !strings.Contains(artifacts.SetupPrompt, "stovo_connection_status") {
		t.Fatalf("expected post-connection logic in prompt: %s", artifacts.SetupPrompt)
	}
	if strings.Contains(artifacts.SetupPrompt, "@") {
		t.Fatalf("expected prompt not to mention alias: %s", artifacts.SetupPrompt)
	}
}

func TestURLForServerDoesNotDuplicateServerRoute(t *testing.T) {
	if got, want := URLForServer("https://stovo.test/s/family", "family"), "https://stovo.test/s/family/mcp"; got != want {
		t.Fatalf("URLForServer = %q, want %q", got, want)
	}
}
