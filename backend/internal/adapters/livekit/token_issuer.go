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
	return i.MintWithTTL(roomName, identity, name, 2*time.Hour)
}

// MintWithTTL creates a room-scoped token whose lifetime is bounded by ttl.
// Public guest sessions use this shorter variant so a copied token cannot be
// used for the lifetime of a meeting link.
func (i TokenIssuer) MintWithTTL(roomName, identity, name string, ttl time.Duration) (string, error) {
	now := time.Now()
	if ttl <= 0 {
		ttl = 15 * time.Minute
	}
	claims := claims{Name: name, Video: &videoGrant{RoomJoin: true, Room: roomName}, RegisteredClaims: jwt.RegisteredClaims{
		Issuer: i.APIKey, Subject: identity, IssuedAt: jwt.NewNumericDate(now), NotBefore: jwt.NewNumericDate(now.Add(-5 * time.Second)), ExpiresAt: jwt.NewNumericDate(now.Add(ttl)),
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
