package config

import "testing"

func TestIntelligenceSourceConfigDefaultsDisabled(t *testing.T) {
	t.Setenv("INTELLIGENCE_SOURCE_ENABLED", "")
	cfg, err := Load()
	if err != nil {
		t.Fatalf("load config: %v", err)
	}
	if cfg.IntelligenceSourceEnabled {
		t.Fatal("Intelligence source must default to disabled")
	}
}
