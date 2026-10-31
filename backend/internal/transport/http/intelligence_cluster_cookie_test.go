package http

import (
	"context"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
)

func TestSourceConsentCookieUsesConfiguredClusterPath(t *testing.T) {
	handler := NewIntelligenceSourceV2ConsentHandler(IntelligenceSourceV2ConsentHandlerConfig{
		BrowserAppURL: "https://messenger.example/s/pilot",
		Authenticate: func(*http.Request) (IntelligenceSourceV2ConsentPrincipal, error) {
			return IntelligenceSourceV2ConsentPrincipal{UserID: "user", FamilyID: "family"}, nil
		},
		Operations: IntelligenceSourceV2ConsentOperations{
			CreateBrowserSession: func(context.Context, *http.Request, IntelligenceSourceV2ConsentPrincipal, IntelligenceBrowserSessionRequest) (IntelligenceBrowserSessionTicket, error) {
				return IntelligenceBrowserSessionTicket{Value: "ticket", ExpiresIn: 120}, nil
			},
			AuthorizeBrowser: func(_ context.Context, _ *http.Request, _ string, in IntelligenceSourceV2ConsentRequest) (IntelligenceSourceV2ConsentRedirect, error) {
				return IntelligenceSourceV2ConsentRedirect{RedirectURI: in.RedirectURI, State: in.State, Code: "code"}, nil
			},
		},
	})
	router := chi.NewRouter()
	router.Mount("/api/v2/intelligence", handler)
	body := `{"flow":"source_v2","response_type":"code","client_id":"client","redirect_uri":"https://intelligence.example/callback","state":"state","code_challenge":"` + browserTestChallenge + `","code_challenge_method":"S256","chat_id":"chat","grants":{"read":true,"process":true,"external_transfer":false,"export":true}}`
	request := httptest.NewRequest(http.MethodPost, "/api/v2/intelligence/authorize-session", strings.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)
	cookies := response.Result().Cookies()
	if response.Code != http.StatusOK || len(cookies) != 1 || cookies[0].Path != "/s/pilot/api/v2/intelligence/authorize" {
		t.Fatalf("cluster cookie: status %d cookies %#v", response.Code, cookies)
	}
	form := url.Values{"response_type": {"code"}, "client_id": {"client"}, "redirect_uri": {"https://intelligence.example/callback"}, "state": {"state"}, "code_challenge": {browserTestChallenge}, "code_challenge_method": {"S256"}, "chat_id": {"chat"}, "read": {"true"}, "process": {"true"}, "external_transfer": {"false"}, "export": {"true"}}
	request = httptest.NewRequest(http.MethodPost, "/api/v2/intelligence/authorize", strings.NewReader(form.Encode()))
	request.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	request.Header.Set("Origin", "https://messenger.example")
	request.AddCookie(cookies[0])
	response = httptest.NewRecorder()
	router.ServeHTTP(response, request)
	cleared := response.Result().Cookies()
	if response.Code != http.StatusFound || len(cleared) != 1 || cleared[0].Path != cookies[0].Path || cleared[0].MaxAge != -1 {
		t.Fatalf("cluster cookie clear: status %d cookies %#v", response.Code, cleared)
	}
}
