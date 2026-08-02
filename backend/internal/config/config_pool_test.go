package config

import "testing"

func TestLoadUsesConfigurableDatabasePoolDefaults(t *testing.T) {
	t.Setenv("DATABASE_MAX_OPEN_CONNS", "")
	t.Setenv("DATABASE_MAX_IDLE_CONNS", "")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("load config: %v", err)
	}
	if cfg.DatabaseMaxOpenConns != 10 || cfg.DatabaseMaxIdleConns != 10 {
		t.Fatalf("unexpected pool defaults: open=%d idle=%d", cfg.DatabaseMaxOpenConns, cfg.DatabaseMaxIdleConns)
	}
}
