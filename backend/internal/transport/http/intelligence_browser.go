package http

import (
	"errors"
	"net/http"
	"net/url"
	"strings"
	"time"
)

func validIntelligenceBrowserSessionRequest(request IntelligenceBrowserSessionRequest) bool {
	parameters := IntelligenceSourceV2ConsentParameters{
		ResponseType: request.ResponseType, ClientID: request.ClientID, RedirectURI: request.RedirectURI,
		State: request.State, CodeChallenge: request.CodeChallenge, CodeChallengeMethod: request.CodeChallengeMethod,
	}
	if request.ResponseType != "code" || !validSourceV2ConsentParameters(parameters) {
		return false
	}
	switch request.Flow {
	case "oidc":
		return request.Nonce != "" && validSourceV2ConsentString(request.Nonce, 512) && request.ChatID == "" && len(request.Grants) == 0
	case "source_v2":
		if request.Nonce != "" || strings.TrimSpace(request.ChatID) == "" || len(request.ChatID) > 256 || len(request.Grants) != len(intelligenceSourceV2GrantFormFields) {
			return false
		}
		for grant := range request.Grants {
			if _, ok := intelligenceSourceV2GrantFormFields[grant]; !ok {
				return false
			}
		}
		return true
	default:
		return false
	}
}

func browserCookieForSessionRequest(request *http.Request, flow string) (string, string) {
	if flow == "oidc" {
		return intelligenceOIDCBrowserCookieName, "/oauth2/authorize"
	}
	path := strings.TrimSuffix(request.URL.Path, "-session")
	if path == "" || path == request.URL.Path {
		path = "/api/v2/intelligence/authorize"
	}
	return intelligenceSourceV2BrowserCookieName, path
}

func redirectIntelligenceAuthorization(w http.ResponseWriter, r *http.Request, result IntelligenceSourceV2ConsentRedirect, redirectURI, state string) bool {
	if result.Code == "" || result.RedirectURI != redirectURI || result.State != state {
		return false
	}
	callback, err := url.ParseRequestURI(result.RedirectURI)
	if err != nil || callback.Scheme != "https" || callback.Host == "" || callback.Fragment != "" {
		return false
	}
	query := callback.Query()
	query.Set("code", result.Code)
	query.Set("state", result.State)
	callback.RawQuery = query.Encode()
	w.Header().Set("Referrer-Policy", "no-referrer")
	http.Redirect(w, r, callback.String(), http.StatusFound)
	return true
}

const intelligenceBrowserSessionLifetimeSeconds = 120

const (
	intelligenceOIDCBrowserCookieName     = "messenger_oidc_browser"
	intelligenceSourceV2BrowserCookieName = "messenger_source_v2_browser"
)

func wantsBrowserHTML(request *http.Request) bool {
	return strings.Contains(strings.ToLower(request.Header.Get("Accept")), "text/html")
}

func intelligenceBrowserConsentPage(appURL, flow string, parameters url.Values) (string, error) {
	base, err := url.Parse(strings.TrimSpace(appURL))
	if err != nil || (base.Scheme != "http" && base.Scheme != "https") || base.Host == "" || base.User != nil || base.RawQuery != "" || base.Fragment != "" {
		return "", errors.New("invalid configured application URL")
	}
	base.Path = strings.TrimRight(base.Path, "/") + "/intelligence/consent"
	query := make(url.Values, len(parameters)+1)
	for key, values := range parameters {
		query[key] = append([]string(nil), values...)
	}
	query.Set("flow", flow)
	base.RawQuery = query.Encode()
	return base.String(), nil
}

func setIntelligenceBrowserCookie(w http.ResponseWriter, appURL, name, path, value string) {
	secure := false
	if parsed, err := url.Parse(strings.TrimSpace(appURL)); err == nil && parsed.Scheme == "https" {
		secure = true
	}
	sameSite := http.SameSiteLaxMode
	if secure {
		// Intelligence may initiate the flow from a different site. Secure+None
		// is required for the subsequent top-level consent form POST to carry the
		// path-bound ticket in modern browsers.
		sameSite = http.SameSiteNoneMode
	}
	http.SetCookie(w, &http.Cookie{
		Name: name, Value: value, Path: path, MaxAge: intelligenceBrowserSessionLifetimeSeconds,
		HttpOnly: true, Secure: secure, SameSite: sameSite,
	})
}

func clearIntelligenceBrowserCookie(w http.ResponseWriter, appURL, name, path string) {
	secure := false
	if parsed, err := url.Parse(strings.TrimSpace(appURL)); err == nil && parsed.Scheme == "https" {
		secure = true
	}
	sameSite := http.SameSiteLaxMode
	if secure {
		sameSite = http.SameSiteNoneMode
	}
	http.SetCookie(w, &http.Cookie{
		Name: name, Value: "", Path: path, MaxAge: -1, Expires: time.Unix(1, 0),
		HttpOnly: true, Secure: secure, SameSite: sameSite,
	})
}
