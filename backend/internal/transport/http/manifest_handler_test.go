package http

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"stovo-messenger/backend/internal/config"
	"stovo-messenger/backend/internal/plugins"
	"stovo-messenger/backend/internal/plugins/builtins"
)

func TestManifestHandler(t *testing.T) {
	cfg := config.Config{
		SolutionProfile: config.ProfileGamer,
		FeatureMatrix:   config.GetPresetMatrix(config.ProfileGamer),
	}

	reg := plugins.NewPluginRegistry()
	reg.Register(builtins.NewBotPlugin())
	reg.Register(builtins.NewThemePackPlugin())

	handler := NewManifestHandler(cfg, reg)

	req := httptest.NewRequest("GET", "/api/v1/config/manifest", nil)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", rec.Code)
	}

	var res map[string]interface{}
	if err := json.Unmarshal(rec.Body.Bytes(), &res); err != nil {
		t.Fatalf("failed to unmarshal json response: %v", err)
	}

	if res["profile"] != "gamer" {
		t.Errorf("expected profile gamer, got %v", res["profile"])
	}

	activePlugins, ok := res["active_plugins"].([]interface{})
	if !ok || len(activePlugins) != 2 {
		t.Errorf("expected 2 active plugins, got %v", res["active_plugins"])
	}
}
