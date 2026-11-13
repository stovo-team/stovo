package http

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"mime"
	stdhttp "net/http"
	"net/url"
	"strings"
)

func parseSourceV2ConsentParameters(values url.Values) (IntelligenceSourceV2ConsentParameters, bool) {
	if len(values) != 5 && len(values) != 6 {
		return IntelligenceSourceV2ConsentParameters{}, false
	}
	responseType := ""
	if len(values) == 6 {
		var ok bool
		responseType, ok = singleFormValue(values, "response_type")
		if !ok || responseType != "code" {
			return IntelligenceSourceV2ConsentParameters{}, false
		}
	}
	clientID, a := singleFormValue(values, "client_id")
	redirectURI, b := singleFormValue(values, "redirect_uri")
	state, c := singleFormValue(values, "state")
	challenge, d := singleFormValue(values, "code_challenge")
	method, e := singleFormValue(values, "code_challenge_method")
	parameters := IntelligenceSourceV2ConsentParameters{ResponseType: responseType, ClientID: clientID, RedirectURI: redirectURI, State: state, CodeChallenge: challenge, CodeChallengeMethod: method}
	return parameters, a && b && c && d && e && validSourceV2ConsentParameters(parameters)
}

func validSourceV2ConsentParameters(parameters IntelligenceSourceV2ConsentParameters) bool {
	return (parameters.ResponseType == "" || parameters.ResponseType == "code") && parameters.ClientID != "" && len(parameters.ClientID) <= 256 && parameters.RedirectURI != "" && len(parameters.RedirectURI) <= 2048 && validSourceV2ConsentString(parameters.State, 512) && parameters.CodeChallengeMethod == "S256" && validSourceV2ConsentChallenge(parameters.CodeChallenge)
}

func validSourceV2ConsentString(value string, max int) bool {
	if value == "" || len(value) > max || strings.TrimSpace(value) != value {
		return false
	}
	for _, char := range value {
		if char < 0x21 || char == 0x7f {
			return false
		}
	}
	return true
}

func validSourceV2ConsentChallenge(value string) bool {
	if len(value) != 43 {
		return false
	}
	decoded, err := base64.RawURLEncoding.DecodeString(value)
	return err == nil && len(decoded) == sha256.Size && base64.RawURLEncoding.EncodeToString(decoded) == value
}

func validSourceV2ConsentGrant(grant string) bool {
	switch grant {
	case "read", "process", "external_transfer", "export", "codex", "reply":
		return true
	default:
		return false
	}
}

func validSourceV2ConsentGrants(grants map[string]bool) bool {
	for grant := range grants {
		if !validSourceV2ConsentGrant(grant) {
			return false
		}
	}
	return true
}

func decodeSourceV2ConsentJSON(w stdhttp.ResponseWriter, r *stdhttp.Request, target any) error {
	if r.URL.RawQuery != "" || r.Body == nil || r.ContentLength > intelligenceSourceV2ConsentMaxBodyBytes {
		return ErrIntelligenceSourceV2ConsentInvalidRequest
	}
	mediaType, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil || !strings.EqualFold(mediaType, "application/json") {
		return ErrIntelligenceSourceV2ConsentInvalidRequest
	}
	r.Body = stdhttp.MaxBytesReader(w, r.Body, intelligenceSourceV2ConsentMaxBodyBytes)
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		return err
	}
	var trailing any
	if err := decoder.Decode(&trailing); err != io.EOF {
		return ErrIntelligenceSourceV2ConsentInvalidRequest
	}
	return nil
}

func writeSourceV2ConsentOperationError(w stdhttp.ResponseWriter, err error) {
	switch {
	case errors.Is(err, ErrIntelligenceSourceV2ConsentInvalidClient):
		w.Header().Set("WWW-Authenticate", `Basic realm="api/v2/intelligence/token"`)
		writeSourceV2ConsentError(w, stdhttp.StatusUnauthorized, "invalid_client")
	case errors.Is(err, ErrIntelligenceSourceV2ConsentUnauthorized):
		writeSourceV2ConsentError(w, stdhttp.StatusUnauthorized, "login_required")
	case errors.Is(err, ErrIntelligenceSourceV2ConsentForbidden):
		writeSourceV2ConsentError(w, stdhttp.StatusForbidden, "access_denied")
	case errors.Is(err, ErrIntelligenceSourceV2ConsentNotFound):
		writeSourceV2ConsentError(w, stdhttp.StatusNotFound, "not_found")
	case errors.Is(err, ErrIntelligenceSourceV2ConsentRateLimited):
		writeSourceV2ConsentError(w, stdhttp.StatusTooManyRequests, "rate_limited")
	case errors.Is(err, ErrIntelligenceSourceV2ConsentInvalidRequest):
		writeSourceV2ConsentError(w, stdhttp.StatusBadRequest, "invalid_request")
	default:
		writeSourceV2ConsentError(w, stdhttp.StatusServiceUnavailable, "server_error")
	}
}

func setSourceV2ConsentNoStore(w stdhttp.ResponseWriter) {
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Pragma", "no-cache")
}

func writeSourceV2ConsentError(w stdhttp.ResponseWriter, status int, code string) {
	writeSourceV2ConsentJSON(w, status, map[string]string{"error": code})
}

func writeSourceV2ConsentJSON(w stdhttp.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}
