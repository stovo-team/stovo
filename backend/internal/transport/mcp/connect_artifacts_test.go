package mcp

import "testing"

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
}

func TestURLForServerDoesNotDuplicateServerRoute(t *testing.T) {
	if got, want := URLForServer("https://stovo.test/s/family", "family"), "https://stovo.test/s/family/mcp"; got != want {
		t.Fatalf("URLForServer = %q, want %q", got, want)
	}
}
