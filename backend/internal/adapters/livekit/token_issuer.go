// Package livekit contains the outbound adapter for the LiveKit protocol.
package livekit

import (
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// TokenIssuer mints the narrow JWT shape expected by LiveKit without leaking
// its SDK or JWT details into call coordination.
type TokenIssuer struct {
	URL       string
	APIKey    string
	APISecret string
}

func (i TokenIssuer) Configured() bool {
	return strings.TrimSpace(i.URL) != "" && strings.TrimSpace(i.APIKey) != "" && strings.TrimSpace(i.APISecret) != ""
}

func (i TokenIssuer) Mint(roomName, identity, name string) (string, error) {
	now := time.Now()
	claims := claims{Name: name, Video: &videoGrant{RoomJoin: true, Room: roomName}, RegisteredClaims: jwt.RegisteredClaims{
		Issuer: i.APIKey, Subject: identity, IssuedAt: jwt.NewNumericDate(now), NotBefore: jwt.NewNumericDate(now.Add(-5 * time.Second)), ExpiresAt: jwt.NewNumericDate(now.Add(2 * time.Hour)),
	}}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(i.APISecret))
}

type claims struct {
	Video *videoGrant `json:"video,omitempty"`
	Name  string      `json:"name,omitempty"`
	jwt.RegisteredClaims
}
type videoGrant struct {
	RoomJoin bool   `json:"roomJoin"`
	Room     string `json:"room"`
}
