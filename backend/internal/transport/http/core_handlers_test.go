package http

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestAssetLinksIncludesCredentialSharing(t *testing.T) {
	recorder := httptest.NewRecorder()
	NewCoreHandlers(CoreHandlerDependencies{}).AssetLinks(recorder, httptest.NewRequest("GET", "/.well-known/assetlinks.json", nil))
	if recorder.Code != http.StatusOK || recorder.Header().Get("Content-Type") != "application/json" {
		t.Fatalf("asset links response: status %d, content type %q", recorder.Code, recorder.Header().Get("Content-Type"))
	}
	var statements []struct {
		Relation []string `json:"relation"`
		Target   struct {
			Namespace    string   `json:"namespace"`
			PackageName  string   `json:"package_name"`
			Fingerprints []string `json:"sha256_cert_fingerprints"`
		} `json:"target"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &statements); err != nil {
		t.Fatal(err)
	}
	found := map[string]bool{}
	for _, statement := range statements {
		for _, relation := range statement.Relation {
			if relation != "delegate_permission/common.handle_all_urls" && relation != "delegate_permission/common.get_login_creds" {
				continue
			}
			if statement.Target.Namespace != "android_app" || statement.Target.PackageName != "com.stakhovivan.stovo" {
				t.Fatalf("relation %q targets wrong Android app: %+v", relation, statement.Target)
			}
			if len(statement.Target.Fingerprints) != 1 || statement.Target.Fingerprints[0] != "18:7C:F4:A5:68:55:01:A0:87:C7:E4:09:59:B3:36:9C:2C:19:D9:D2:C3:00:87:72:08:92:44:81:40:91:37:F9" {
				t.Fatalf("relation %q targets wrong signing certificate: %v", relation, statement.Target.Fingerprints)
			}
			found[relation] = true
		}
	}
	for _, relation := range []string{"delegate_permission/common.handle_all_urls", "delegate_permission/common.get_login_creds"} {
		if !found[relation] {
			t.Errorf("asset links missing relation %q", relation)
		}
	}
}
