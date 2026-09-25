package http

import (
	"encoding/json"
	stdhttp "net/http"

	"stovo-messenger/backend/internal/config"
	"stovo-messenger/backend/internal/plugins"
)

type ManifestHandler struct {
	cfg      config.Config
	registry *plugins.PluginRegistry
}

func NewManifestHandler(cfg config.Config, registry *plugins.PluginRegistry) stdhttp.Handler {
	handler := &ManifestHandler{cfg: cfg, registry: registry}
	return stdhttp.HandlerFunc(func(w stdhttp.ResponseWriter, r *stdhttp.Request) {
		pluginIDs := []string{}
		if handler.registry != nil {
			for _, status := range handler.registry.Statuses() {
				if status.Enabled {
					pluginIDs = append(pluginIDs, status.ID)
				}
			}
		}

		response := map[string]interface{}{
			"profile":      handler.cfg.FeatureMatrix.Profile,
			"display_name": handler.cfg.FeatureMatrix.DisplayName,
			"screens":      handler.cfg.FeatureMatrix.Screens,
			"features": map[string]interface{}{
				"presence_detail_level": handler.cfg.FeatureMatrix.PresenceDetailLevel,
				"end_to_end_encryption": handler.cfg.FeatureMatrix.EndToEndEncryption,
				"custom_emojis":         handler.cfg.FeatureMatrix.CustomEmojis,
				"file_upload_limit_mb":  handler.cfg.FeatureMatrix.FileUploadLimitMB,
				"default_theme":         handler.cfg.FeatureMatrix.DefaultTheme,
				"allow_public_invites":  handler.cfg.FeatureMatrix.AllowPublicInvites,
				"require_sso_auth":      handler.cfg.FeatureMatrix.RequireSSOAuth,
			},
			"active_plugins": pluginIDs,
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(stdhttp.StatusOK)
		_ = json.NewEncoder(w).Encode(response)
	})
}
