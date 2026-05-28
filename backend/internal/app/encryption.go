package app

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"io"
	"strings"
)

const (
	encryptionProtocolEndToEnd      = "end_to_end"
	encryptionProtocolServerAtRest  = "server_at_rest"
	encryptionProtocolLegacyPlain   = "legacy_plaintext"
	messageEncryptionMetadataServer = `{"algorithm":"AES-256-GCM","scope":"server_at_rest"}`
)

func supportedEncryptionProtocols() []encryptionProtocolPublic {
	return []encryptionProtocolPublic{
		{
			Value:       encryptionProtocolEndToEnd,
			Label:       "End-to-end",
			Description: "Message text is encrypted in the browser before it reaches the server.",
		},
		{
			Value:       encryptionProtocolServerAtRest,
			Label:       "Server encrypted",
			Description: "Message text is encrypted before database storage and decrypted for authorized reads.",
		},
	}
}

func normalizeEncryptionProtocol(value string) (string, error) {
	switch strings.TrimSpace(value) {
	case "", encryptionProtocolServerAtRest:
		return encryptionProtocolServerAtRest, nil
	case encryptionProtocolEndToEnd:
		return encryptionProtocolEndToEnd, nil
	default:
		return "", fmt.Errorf("unsupported encryption protocol")
	}
}

func (s *Server) serverEncryptionKey(familyID string) []byte {
	sum := sha256.Sum256([]byte(s.cfg.JWTSecret + ":" + familyID + ":messages:v1"))
	return sum[:]
}

func (s *Server) encryptServerAtRest(familyID, plaintext string) (ciphertext string, nonce string, err error) {
	block, err := aes.NewCipher(s.serverEncryptionKey(familyID))
	if err != nil {
		return "", "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", "", err
	}
	nonceBytes := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonceBytes); err != nil {
		return "", "", err
	}
	sealed := gcm.Seal(nil, nonceBytes, []byte(plaintext), nil)
	return base64.StdEncoding.EncodeToString(sealed), base64.StdEncoding.EncodeToString(nonceBytes), nil
}

func (s *Server) decryptServerAtRest(familyID, ciphertext, nonce string) (*string, error) {
	if strings.TrimSpace(ciphertext) == "" || strings.TrimSpace(nonce) == "" {
		return nil, nil
	}
	block, err := aes.NewCipher(s.serverEncryptionKey(familyID))
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	nonceBytes, err := base64.StdEncoding.DecodeString(nonce)
	if err != nil {
		return nil, err
	}
	ciphertextBytes, err := base64.StdEncoding.DecodeString(ciphertext)
	if err != nil {
		return nil, err
	}
	plaintext, err := gcm.Open(nil, nonceBytes, ciphertextBytes, nil)
	if err != nil {
		return nil, err
	}
	value := string(plaintext)
	return &value, nil
}
