package config

import (
	"crypto/rsa"
	"crypto/x509"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"io"
	"net/url"
	"os"
	"strings"
)

// IntelligenceOIDCSigningPublicKey is a retired public key retained in JWKS
// during the rotation overlap window. It never contains private key material.
type IntelligenceOIDCSigningPublicKey struct {
	KeyID        string `json:"kid"`
	PublicKeyPEM string `json:"public_key_pem"`
}

func (c *Config) loadIntelligenceOIDCFromEnvironment() error {
	c.IntelligenceSourceV2RestoreEpoch = strings.TrimSpace(os.Getenv("INTELLIGENCE_SOURCE_V2_RESTORE_EPOCH"))
	c.IntelligenceOIDCEnabled = envBool("INTELLIGENCE_OIDC_ENABLED", false)
	c.IntelligenceOIDCIssuer = strings.TrimSpace(os.Getenv("INTELLIGENCE_OIDC_ISSUER"))
	c.IntelligenceOIDCClientID = strings.TrimSpace(os.Getenv("INTELLIGENCE_OIDC_CLIENT_ID"))
	c.IntelligenceOIDCClientSecret = strings.TrimSpace(os.Getenv("INTELLIGENCE_OIDC_CLIENT_SECRET"))
	c.IntelligenceOIDCRedirectURIs = splitCSV(os.Getenv("INTELLIGENCE_OIDC_REDIRECT_URIS"))
	c.IntelligenceOIDCSigningKeyID = strings.TrimSpace(os.Getenv("INTELLIGENCE_OIDC_SIGNING_KEY_ID"))
	c.IntelligenceOIDCSigningPrivateKeyPEM = strings.TrimSpace(os.Getenv("INTELLIGENCE_OIDC_SIGNING_PRIVATE_KEY_PEM"))

	if c.IntelligenceOIDCEnabled {
		previousKeysJSON := strings.TrimSpace(os.Getenv("INTELLIGENCE_OIDC_PREVIOUS_SIGNING_KEYS_JSON"))
		if previousKeysJSON != "" {
			decoder := json.NewDecoder(strings.NewReader(previousKeysJSON))
			decoder.DisallowUnknownFields()
			if previousKeysJSON[0] != '[' || decoder.Decode(&c.IntelligenceOIDCPreviousSigningKeys) != nil {
				return fmt.Errorf("invalid Intelligence OIDC config: previous signing keys must be a JSON array")
			}
			var trailing any
			if err := decoder.Decode(&trailing); err != io.EOF {
				return fmt.Errorf("invalid Intelligence OIDC config: previous signing keys must be a JSON array")
			}
		}
	}
	return c.validateIntelligenceOIDC()
}

func (c Config) validateIntelligenceOIDC() error {
	if !c.IntelligenceOIDCEnabled {
		return nil
	}
	if !canonicalHTTPSIssuer(c.IntelligenceOIDCIssuer) {
		return fmt.Errorf("invalid Intelligence OIDC config: issuer must be a canonical HTTPS URL")
	}
	if c.IntelligenceOIDCClientID == "" || c.IntelligenceOIDCClientSecret == "" || !validOIDCKeyID(c.IntelligenceOIDCSigningKeyID) {
		return fmt.Errorf("invalid Intelligence OIDC config: client and signing key identifiers are required")
	}
	if len(c.IntelligenceOIDCRedirectURIs) == 0 {
		return fmt.Errorf("invalid Intelligence OIDC config: at least one exact HTTPS callback is required")
	}
	seenRedirectURIs := make(map[string]struct{}, len(c.IntelligenceOIDCRedirectURIs))
	for _, redirectURI := range c.IntelligenceOIDCRedirectURIs {
		parsed, err := url.ParseRequestURI(redirectURI)
		if err != nil || parsed.Scheme != "https" || parsed.Host == "" || parsed.User != nil || parsed.Fragment != "" || parsed.ForceQuery || parsed.Opaque != "" || parsed.String() != redirectURI {
			return fmt.Errorf("invalid Intelligence OIDC config: callback URIs must be exact HTTPS URLs without fragments")
		}
		if _, exists := seenRedirectURIs[redirectURI]; exists {
			return fmt.Errorf("invalid Intelligence OIDC config: callback URIs must be unique")
		}
		seenRedirectURIs[redirectURI] = struct{}{}
	}
	if !validOIDCSigningPrivateKey(c.IntelligenceOIDCSigningPrivateKeyPEM) {
		return fmt.Errorf("invalid Intelligence OIDC config: signing key must be an RSA PKCS#8 or PKCS#1 PEM key of at least 2048 bits")
	}
	if len(c.IntelligenceOIDCPreviousSigningKeys) > 8 {
		return fmt.Errorf("invalid Intelligence OIDC config: at most eight previous signing keys are allowed")
	}
	seenKeyIDs := map[string]struct{}{c.IntelligenceOIDCSigningKeyID: {}}
	for _, key := range c.IntelligenceOIDCPreviousSigningKeys {
		if !validOIDCKeyID(key.KeyID) || !validOIDCSigningPublicKey(key.PublicKeyPEM) {
			return fmt.Errorf("invalid Intelligence OIDC config: previous signing keys require a key ID and an RSA public key of at least 2048 bits")
		}
		if _, exists := seenKeyIDs[key.KeyID]; exists {
			return fmt.Errorf("invalid Intelligence OIDC config: signing key IDs must be unique")
		}
		seenKeyIDs[key.KeyID] = struct{}{}
	}
	return nil
}

func canonicalHTTPSIssuer(raw string) bool {
	parsed, err := url.Parse(raw)
	if err != nil || parsed.Scheme != "https" || parsed.Host == "" || parsed.Hostname() == "" || parsed.User != nil || parsed.RawQuery != "" || parsed.ForceQuery || parsed.Fragment != "" || parsed.Opaque != "" {
		return false
	}
	if strings.ToLower(parsed.Host) != parsed.Host || parsed.Port() == "443" || parsed.RawPath != "" || parsed.Path != "" {
		return false
	}
	return parsed.String() == raw
}

func validOIDCKeyID(value string) bool {
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

func validOIDCSigningPrivateKey(raw string) bool {
	block, rest := pem.Decode([]byte(raw))
	if block == nil || strings.TrimSpace(string(rest)) != "" {
		return false
	}
	var parsed any
	var err error
	switch block.Type {
	case "PRIVATE KEY":
		parsed, err = x509.ParsePKCS8PrivateKey(block.Bytes)
	case "RSA PRIVATE KEY":
		parsed, err = x509.ParsePKCS1PrivateKey(block.Bytes)
	default:
		return false
	}
	if err != nil {
		return false
	}
	key, ok := parsed.(*rsa.PrivateKey)
	return ok && key.N.BitLen() >= 2048 && key.Validate() == nil
}

func validOIDCSigningPublicKey(raw string) bool {
	block, rest := pem.Decode([]byte(raw))
	if block == nil || strings.TrimSpace(string(rest)) != "" {
		return false
	}
	var parsed any
	var err error
	switch block.Type {
	case "PUBLIC KEY":
		parsed, err = x509.ParsePKIXPublicKey(block.Bytes)
	case "RSA PUBLIC KEY":
		parsed, err = x509.ParsePKCS1PublicKey(block.Bytes)
	default:
		return false
	}
	if err != nil {
		return false
	}
	key, ok := parsed.(*rsa.PublicKey)
	return ok && key.N.BitLen() >= 2048 && key.E >= 3 && key.E%2 == 1
}
