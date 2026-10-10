package config

import "testing"

func TestIntelligenceSourceConfigDefaultsDisabled(t *testing.T) {
	t.Setenv("INTELLIGENCE_SOURCE_ENABLED", "")
	t.Setenv("INTELLIGENCE_SOURCE_V2_RESTORE_EPOCH", "")
	cfg, err := Load()
	if err != nil {
		t.Fatalf("load config: %v", err)
	}
	if cfg.IntelligenceSourceEnabled {
		t.Fatal("Intelligence source must default to disabled")
	}
	if cfg.IntelligenceSourceV2RestoreEpoch != "" {
		t.Fatalf("restore epoch defaults to %q, want empty fail-closed configuration", cfg.IntelligenceSourceV2RestoreEpoch)
	}
}
