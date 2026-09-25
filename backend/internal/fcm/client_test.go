package fcm

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestUnconfiguredFCMClient(t *testing.T) {
	client, err := NewClient(context.Background(), "", "")
	if err != nil {
		t.Fatalf("expected nil err for empty credentials, got: %v", err)
	}
	if client.IsConfigured() {
		t.Fatalf("expected client to not be configured")
	}

	// Should safely no-op without error
	err = client.SendChatMessage(context.Background(), "test-token", "chat-1", "direct", "Alice", "Hello", 3, nil)
	if err != nil {
		t.Errorf("expected nil error on unconfigured SendChatMessage, got: %v", err)
	}

	err = client.SendCallRinging(context.Background(), "test-token", "chat-1", "Alice")
	if err != nil {
		t.Errorf("expected nil error on unconfigured SendCallRinging, got: %v", err)
	}

	err = client.SendCallMissed(context.Background(), "test-token", "chat-1", "Alice")
	if err != nil {
		t.Errorf("expected nil error on unconfigured SendCallMissed, got: %v", err)
	}
}

func TestRegistrationTokenMessageUsesFCMTokenField(t *testing.T) {
	message := registrationTokenMessage("registration-token", map[string]string{"event": "message"}, "high")
	encoded, err := json.Marshal(message)
	if err != nil {
		t.Fatalf("marshal FCM message: %v", err)
	}
	var payload map[string]json.RawMessage
	if err := json.Unmarshal(encoded, &payload); err != nil {
		t.Fatalf("decode FCM message: %v", err)
	}
	if string(payload["token"]) != `"registration-token"` {
		t.Fatalf("token field = %s, want FCM registration token", payload["token"])
	}
	if _, exists := payload["fid"]; exists {
		t.Fatalf("registration token was incorrectly serialized as a Firebase installation ID: %s", encoded)
	}
}

func TestNewClientRejectsNonServiceAccountCredentials(t *testing.T) {
	credentialsJSON := `{"type":"authorized_user","client_id":"client-id","client_secret":"client-secret","refresh_token":"refresh-token"}`

	t.Run("JSON credentials", func(t *testing.T) {
		if _, err := NewClient(context.Background(), "", credentialsJSON); err == nil {
			t.Fatal("expected non-service-account credentials to be rejected")
		}
	})

	t.Run("file credentials", func(t *testing.T) {
		path := filepath.Join(t.TempDir(), "credentials.json")
		if err := os.WriteFile(path, []byte(credentialsJSON), 0600); err != nil {
			t.Fatalf("write credentials fixture: %v", err)
		}
		if _, err := NewClient(context.Background(), path, ""); err == nil {
			t.Fatal("expected non-service-account credentials to be rejected")
		}
	})
}

func TestNewClientAcceptsServiceAccountCredentials(t *testing.T) {
	credentialsJSON := validServiceAccountCredentials(t)

	t.Run("JSON credentials", func(t *testing.T) {
		client, err := NewClient(context.Background(), "", credentialsJSON)
		if err != nil {
			t.Fatalf("NewClient with service-account JSON: %v", err)
		}
		if client == nil || !client.IsConfigured() {
			t.Fatal("NewClient with service-account JSON returned an unconfigured client")
		}
	})

	t.Run("file credentials", func(t *testing.T) {
		path := filepath.Join(t.TempDir(), "credentials.json")
		if err := os.WriteFile(path, []byte(credentialsJSON), 0600); err != nil {
			t.Fatalf("write credentials fixture: %v", err)
		}
		client, err := NewClient(context.Background(), path, "")
		if err != nil {
			t.Fatalf("NewClient with service-account file: %v", err)
		}
		if client == nil || !client.IsConfigured() {
			t.Fatal("NewClient with service-account file returned an unconfigured client")
		}
	})
}

func validServiceAccountCredentials(t *testing.T) string {
	t.Helper()
	const privateKeyPEM = `-----BEGIN RSA PRIVATE KEY-----
MIIEowIBAAKCAQEAriLoaNmdHbnau46BHGJIZFwkU9kchiDHOCUnrLeCA7WVXMpU
Bxbn9B0OkapbQTp5nJYxhe2zFtFoICxRtoW5Lvv95ZL63qtKZCkQarp1BOj3qt3e
Dmdbjp6t/MVq7hDFGesq7aofVnfm8oRW5BJgv6LlpF7DkgPtBtoe1GGdIkDZMO0y
o8uloZtZUo0WHhZjmRRNvDGAJUt1K6GeDjLNn9VbOIIkCIjvOKiTZrBcn/jal6pR
5VLhhzRs8R1YCdNEaUTJnVDddnYB9ZG+6V/zOyaBeH5b+n7+pnY+aJBsmyujnu+D
Xs0BtQ4SVJ67Xm/hN94aIx4ow1x4mu91vfKo4QIDAQABAoIBAQCELFrbutFWzssH
sZKuSKtKAeZQ/mp4JEkShKEop+E3j4xfcfN1rh1BXQzB49yAFjJYeGf+j/1vRGMU
iI89SyLUVtDQgE+K09kTTVf4qq5Hm8zhFKaHqEwGZMsLIY2YRYJVufpLiuVebIQP
cAPD+W8WBj7oFEW9ft1aZhUgfzcV14JxhQWGPWmlbU6QjBpKxAOs2uHblXIT9QP/
1dB0MR3cp/lug6n+1+RMLYhnoLfDnPU/mCm4DoTvXY+2FGR5vhv0YQaa6VS2mjuz
UD9M8v9IGxjpFGTeMyqXROef/qa5UZwPwdtSpsJWriebmlq66xBNFNFNkE9pJL6z
2Uvt/9lBAoGBANbj0a53vrYT04anvD2qHOpJZAldb37P1xV8TGk+gIWVuHvzbHHc
M+vnWXExtGMf5ALjjbvEb/J7bIJ5NuLCCAC6eIRHgEkPl+ELHB2R0VwXGWG6obJf
fEvNv0L69ADDCMCP4ovbFqXm7dkVMOqk7WtquyhLAcDpUS92WRwA2xtnAoGBAM9z
MXcaqU2SxII7Bft+xRzWUxAh3qwP1uVM4laaKpJnyZftvDquwF7HNn1qNluhE3rB
9VgKsbWACM5J7rhmAAQaL9j+nYejpCXzibVIegY+rTDY4kW2OWkY3Ikc4ktxadZ0
GDDNEWcZYjAj1Z2QOgYvwWDUEWMxI92PggNoODR3AoGALsAttBlVImO510fSyk+i
Ls58txTe1uX80y3RqevxJh7mngDdjP/tQ9t3OAsqRY6AmqhLA5i/CjAT8WbRrA+u
kgn/gjfUDxEXZ9x053H77F8SJJLn7tibQBqpC7dxMmE8HDixft/RU5KkGGBl3ga3
qHD1+tQms4OPKBZFWLRO9u0CgYANyDdnFExfLPsFM+qn1Lo/ujV2gumKQNskDMGU
w1VEuMR55X913ppFMbL7Dg1idQcYRr6IBN3dkw4CtoK3mX8yxpKbNf89Pa/wHYfu
lUwWEh/reN0/iGW0B8TPDy4xmO1RJBFfXKBlWxhc3mSYvTY9pvqP9kbZcjBRzfDz
TP8+7QKBgEmdXUKvC66mbPjKrnaAq1pGw1uo8fOnaqj0vJXV0Qgr9jfBThgPPx26
cZcR6bdiRGFP5LZXgc4pgPVIhdXDiVn/8cAqmbTPHNL68Ae3MCOekZFgPtngAd5r
p6WrEiVPUw6nzjYuWMaHLAeahxWCwJAxYCpc8zomK3byrwp8No1y
-----END RSA PRIVATE KEY-----`
	credentials := map[string]string{
		"type":                        "service_account",
		"project_id":                  "test-project",
		"private_key_id":              "test-key-id",
		"private_key":                 privateKeyPEM,
		"client_email":                "fcm-test@test-project.iam.gserviceaccount.com",
		"client_id":                   "1234567890",
		"auth_uri":                    "https://accounts.google.com/o/oauth2/auth",
		"token_uri":                   "https://oauth2.googleapis.com/token",
		"auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
		"client_x509_cert_url":        "https://www.googleapis.com/robot/v1/metadata/x509/fcm-test%40test-project.iam.gserviceaccount.com",
	}
	encoded, err := json.Marshal(credentials)
	if err != nil {
		t.Fatalf("marshal service-account credentials: %v", err)
	}
	return string(encoded)
}
