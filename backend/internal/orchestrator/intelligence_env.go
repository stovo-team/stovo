package orchestrator

import (
	"fmt"
	"strings"
)

// Remove old integration credentials when the selected tenant changes.
func intelligenceEnvironmentChanged(existing, desired map[string]string) bool {
	for name := range existing {
		if strings.HasPrefix(name, "INTELLIGENCE_") {
			if _, ok := desired[name]; !ok {
				return true
			}
		}
	}
	return false
}

func appendIntelligenceEnvironment(environment []string, slug string, get func(string, string) string) []string {
	if slug != "" && slug == get("INTELLIGENCE_INTEGRATION_TENANT_SLUG", "") {
		for _, name := range []string{
			"INTELLIGENCE_OIDC_ENABLED", "INTELLIGENCE_SOURCE_ENABLED",
			"INTELLIGENCE_OIDC_ISSUER", "INTELLIGENCE_OIDC_CLIENT_ID", "INTELLIGENCE_OIDC_CLIENT_SECRET",
			"INTELLIGENCE_OIDC_REDIRECT_URIS", "INTELLIGENCE_OIDC_SIGNING_KEY_ID",
			"INTELLIGENCE_OIDC_SIGNING_PRIVATE_KEY_PEM", "INTELLIGENCE_OIDC_PREVIOUS_SIGNING_KEYS_JSON",
			"INTELLIGENCE_SOURCE_V2_RESTORE_EPOCH",
		} {
			environment = append(environment, fmt.Sprintf("%s=%s", name, get(name, "")))
		}
	}
	return environment
}
