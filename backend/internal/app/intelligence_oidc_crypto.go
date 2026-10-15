package app

import (
	"crypto/rsa"
	"crypto/sha256"
	"crypto/subtle"
	"crypto/x509"
	"encoding/base64"
	"encoding/pem"
	"errors"
	"math/big"
	"strings"
)

type intelligenceOIDCJWK struct {
	KTY string `json:"kty"`
	USE string `json:"use"`
	ALG string `json:"alg"`
	KID string `json:"kid"`
	N   string `json:"n"`
	E   string `json:"e"`
}

func intelligenceOIDCJWKFor(keyID string, key *rsa.PublicKey) intelligenceOIDCJWK {
	return intelligenceOIDCJWK{
		KTY: "RSA", USE: "sig", ALG: "RS256", KID: keyID,
		N: base64.RawURLEncoding.EncodeToString(key.N.Bytes()),
		E: base64.RawURLEncoding.EncodeToString(big.NewInt(int64(key.E)).Bytes()),
	}
}

func validIntelligenceOIDCKeyID(value string) bool {
	if value == "" || len(value) > 128 || strings.TrimSpace(value) != value {
		return false
	}
	for _, char := range value {
		if char < 0x21 || char > 0x7e {
			return false
		}
	}
	return true
}

func validIntelligenceOIDCString(value string, max int) bool {
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

func validIntelligenceOIDCChallenge(value string) bool {
	if len(value) != 43 {
		return false
	}
	decoded, err := base64.RawURLEncoding.DecodeString(value)
	return err == nil && len(decoded) == sha256.Size && base64.RawURLEncoding.EncodeToString(decoded) == value
}

func validIntelligenceOIDCVerifier(value string) bool {
	if len(value) < 43 || len(value) > 128 {
		return false
	}
	for _, char := range value {
		switch {
		case char >= 'A' && char <= 'Z', char >= 'a' && char <= 'z', char >= '0' && char <= '9', strings.ContainsRune("-._~", char):
		default:
			return false
		}
	}
	return true
}

func intelligenceOIDCPKCEVerifierMatches(verifier, challenge string) bool {
	digest := sha256.Sum256([]byte(verifier))
	computed := base64.RawURLEncoding.EncodeToString(digest[:])
	return len(computed) == len(challenge) && subtle.ConstantTimeCompare([]byte(computed), []byte(challenge)) == 1
}

func containsExactString(values []string, expected string) bool {
	for _, value := range values {
		if value == expected {
			return true
		}
	}
	return false
}

func parseIntelligenceOIDCPrivateKey(raw string) (*rsa.PrivateKey, error) {
	block, rest := pem.Decode([]byte(raw))
	if block == nil || strings.TrimSpace(string(rest)) != "" {
		return nil, errors.New("invalid private key")
	}
	var key *rsa.PrivateKey
	switch block.Type {
	case "PRIVATE KEY":
		parsed, err := x509.ParsePKCS8PrivateKey(block.Bytes)
		if err != nil {
			return nil, err
		}
		var ok bool
		key, ok = parsed.(*rsa.PrivateKey)
		if !ok {
			return nil, errors.New("not an RSA private key")
		}
	case "RSA PRIVATE KEY":
		var err error
		key, err = x509.ParsePKCS1PrivateKey(block.Bytes)
		if err != nil {
			return nil, err
		}
	default:
		return nil, errors.New("unsupported private key PEM")
	}
	if key.N.BitLen() < 2048 || key.Validate() != nil {
		return nil, errors.New("invalid RSA private key")
	}
	return key, nil
}

func parseIntelligenceOIDCPublicKey(raw string) (*rsa.PublicKey, error) {
	block, rest := pem.Decode([]byte(raw))
	if block == nil || strings.TrimSpace(string(rest)) != "" {
		return nil, errors.New("invalid public key")
	}
	var public any
	var err error
	switch block.Type {
	case "PUBLIC KEY":
		public, err = x509.ParsePKIXPublicKey(block.Bytes)
	case "RSA PUBLIC KEY":
		public, err = x509.ParsePKCS1PublicKey(block.Bytes)
	default:
		return nil, errors.New("unsupported public key PEM")
	}
	if err != nil {
		return nil, err
	}
	key, ok := public.(*rsa.PublicKey)
	if !ok || key.N.BitLen() < 2048 || key.E < 3 || key.E%2 == 0 {
		return nil, errors.New("invalid RSA public key")
	}
	return key, nil
}
