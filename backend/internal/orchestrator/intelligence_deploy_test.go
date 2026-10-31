package orchestrator

import "testing"

func TestIntelligenceSettingsAreConfinedToSelectedTenant(t *testing.T) {
	values := map[string]string{"INTELLIGENCE_INTEGRATION_TENANT_SLUG": "pilot", "INTELLIGENCE_OIDC_ENABLED": "true", "INTELLIGENCE_SOURCE_ENABLED": "true", "INTELLIGENCE_OIDC_CLIENT_SECRET": "synthetic-secret"}
	get := func(key, fallback string) string {
		if value, ok := values[key]; ok {
			return value
		}
		return fallback
	}
	selected := parseEnvSlice(backendContainerEnv("pilot", get))
	other := parseEnvSlice(backendContainerEnv("other", get))
	for _, name := range []string{"INTELLIGENCE_OIDC_ENABLED", "INTELLIGENCE_SOURCE_ENABLED", "INTELLIGENCE_OIDC_CLIENT_SECRET"} {
		if selected[name] != values[name] {
			t.Errorf("selected tenant: %s = %q", name, selected[name])
		}
		if _, ok := other[name]; ok {
			t.Errorf("other tenant received %s", name)
		}
	}
}

func TestRemovingTenantEnrollmentRequiresContainerRecreation(t *testing.T) {
	existing := map[string]string{"INTELLIGENCE_OIDC_CLIENT_SECRET": "synthetic-secret", "INTELLIGENCE_SOURCE_ENABLED": "true"}
	if !intelligenceEnvironmentChanged(existing, map[string]string{}) {
		t.Fatal("removing tenant selection must remove existing credentials from its container")
	}
	if intelligenceEnvironmentChanged(map[string]string{}, map[string]string{}) {
		t.Fatal("unchanged environment should not require recreation")
	}
}
