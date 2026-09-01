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
	return stdhttp.HandlerFunc(func(w stdhttp.ResponseWriter, r *stdhttp.Request) {
		pluginIDs := []string{}
		if registry != nil {
			for _, p := range registry.List() {
				pluginIDs = append(pluginIDs, p.ID())
			}
		}

		response := map[string]interface{}{
			"profile":      cfg.FeatureMatrix.Profile,
			"display_name": cfg.FeatureMatrix.DisplayName,
			"screens":      cfg.FeatureMatrix.Screens,
			"features": map[string]interface{}{
				"presence_detail_level": cfg.FeatureMatrix.PresenceDetailLevel,
				"end_to_end_encryption": cfg.FeatureMatrix.EndToEndEncryption,
				"custom_emojis":       cfg.FeatureMatrix.CustomEmojis,
				"file_upload_limit_mb": cfg.FeatureMatrix.FileUploadLimitMB,
				"default_theme":        cfg.FeatureMatrix.DefaultTheme,
				"allow_public_invites": cfg.FeatureMatrix.AllowPublicInvites,
				"require_sso_auth":     cfg.FeatureMatrix.RequireSSOAuth,
			},
			"active_plugins": pluginIDs,
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(stdhttp.StatusOK)
		_ = json.NewEncoder(w).Encode(response)
	})
}
