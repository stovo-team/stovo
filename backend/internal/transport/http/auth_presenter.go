package http

import (
	"encoding/json"
	stdhttp "net/http"
)

// AuthSuccess is the stable wire representation returned after an account has
// authenticated or refreshed a session. User intentionally remains generic:
// this outer transport serializes the application-supplied public account DTO
// without depending on the app compatibility package.
type AuthSuccess[User any] struct {
	AccessToken      string `json:"accessToken"`
	TokenType        string `json:"tokenType"`
	ExpiresInSeconds int64  `json:"expiresInSeconds"`
	User             User   `json:"user"`
	RefreshToken     string `json:"refreshToken,omitempty"`
}

// WriteAuthSuccess writes the established JSON auth contract. Cookie policy
// deliberately remains with the caller because it is tied to session encoding
// and deployment configuration, rather than presentation.
func WriteAuthSuccess[User any](w stdhttp.ResponseWriter, status int, response AuthSuccess[User]) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(response)
}
