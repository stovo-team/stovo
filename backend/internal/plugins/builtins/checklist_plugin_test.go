package builtins

import (
	"context"
	"testing"

	"stovo-messenger/backend/internal/plugins"
)

func TestChecklistPluginConfigurable(t *testing.T) {
	p := NewChecklistPlugin()
	if p.ID() != "plugin-checklist" {
		t.Fatalf("expected ID plugin-checklist, got %s", p.ID())
	}
	if p.Name() != "Shared Checklists" {
		t.Fatalf("expected Name Shared Checklists, got %s", p.Name())
	}

	var _ plugins.ConfigurablePlugin = p

	if !p.Enabled() {
		t.Fatalf("expected enabled by default")
	}

	if err := p.SetEnabled(context.Background(), false); err != nil {
		t.Fatalf("unexpected error setting enabled=false: %v", err)
	}
	if p.Enabled() {
		t.Fatalf("expected disabled after SetEnabled(false)")
	}

	if err := p.SetEnabled(context.Background(), true); err != nil {
		t.Fatalf("unexpected error setting enabled=true: %v", err)
	}
	if !p.Enabled() {
		t.Fatalf("expected enabled after SetEnabled(true)")
	}
}

func TestCanvasPluginConfigurable(t *testing.T) {
	p := NewCanvasPlugin()
	if p.ID() != "plugin-canvas" {
		t.Fatalf("expected ID plugin-canvas, got %s", p.ID())
	}

	var _ plugins.ConfigurablePlugin = p

	if !p.Enabled() {
		t.Fatalf("expected enabled by default")
	}

	if err := p.SetEnabled(context.Background(), false); err != nil {
		t.Fatalf("unexpected error setting enabled=false: %v", err)
	}
	if p.Enabled() {
		t.Fatalf("expected disabled after SetEnabled(false)")
	}
}
