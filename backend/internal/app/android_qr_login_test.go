package app

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"stovo-messenger/backend/internal/config"
	"stovo-messenger/backend/internal/features/identity"
	"stovo-messenger/backend/internal/ports"
	httptransport "stovo-messenger/backend/internal/transport/http"
)

type androidQRGrantResponse struct {
	RequestID string    `json:"requestId"`
	ExpiresAt time.Time `json:"expiresAt"`
}

type androidQRStoreFake struct {
	identity.AuthMethodsStore
	hash, familyID, userID string
	expiresAt              time.Time
}

func (s *androidQRStoreFake) CreateAndroidQRLoginGrant(_ context.Context, hash, familyID, userID string, expiresAt time.Time) error {
	s.hash, s.familyID, s.userID, s.expiresAt = hash, familyID, userID, expiresAt
	return nil
}
func (*androidQRStoreFake) ConsumeAndroidQRLoginGrant(context.Context, string) (identity.AndroidQRLoginGrant, error) {
	return identity.AndroidQRLoginGrant{}, sql.ErrNoRows
}

type androidQRRateFake struct {
	ports.Cache
	counts map[string]int64
}

func (c *androidQRRateFake) Increment(_ context.Context, key string, ttl int) (int64, error) {
	if ttl != 60 {
		panic("Android QR limits must use a one-minute window")
	}
	c.counts[key]++
	return c.counts[key], nil
}

// This contract runs without integration services, so a skipped database suite
// cannot hide missing routes, grant binding, hashing, expiry, or rate limits.
func TestAndroidQRLoginHandlerContract(t *testing.T) {
	store := &androidQRStoreFake{}
	s := &Server{cfg: config.Config{RefreshTokenSecret: "test-key"}, authMethods: store, cache: &androidQRRateFake{counts: map[string]int64{}}}
	router := chi.NewRouter()
	httptransport.RegisterAuthRoutes(router, s.authRoutes())
	rejected := httptest.NewRecorder()
	router.ServeHTTP(rejected, httptest.NewRequest(http.MethodPost, "/api/auth/android-qr-login", nil))
	if rejected.Code != http.StatusUnauthorized {
		t.Fatalf("unauthenticated creation = %d", rejected.Code)
	}
	actor := userPublic{ID: "user-a", FamilyID: "family-a", IsActive: true}
	before := time.Now()
	for i := 1; i <= 9; i++ {
		result := httptest.NewRecorder()
		s.createAndroidQRLogin(result, httptest.NewRequest(http.MethodPost, "/api/auth/android-qr-login", nil), actor)
		want := http.StatusCreated
		if i == 9 {
			want = http.StatusTooManyRequests
		}
		if result.Code != want {
			t.Fatalf("creation %d = %d, want %d", i, result.Code, want)
		}
		if i == 1 {
			var grant androidQRGrantResponse
			if err := json.Unmarshal(result.Body.Bytes(), &grant); err != nil {
				t.Fatal(err)
			}
			if grant.RequestID == "" || store.hash == grant.RequestID || store.hash != tokenHash(s.cfg.RefreshTokenSecret, grant.RequestID) {
				t.Fatal("grant must store only a keyed hash")
			}
			if store.userID != actor.ID || store.familyID != actor.FamilyID {
				t.Fatal("grant lost user/family binding")
			}
			if grant.ExpiresAt.Before(before.Add(2*time.Minute)) || grant.ExpiresAt.After(time.Now().Add(2*time.Minute)) || !grant.ExpiresAt.Equal(store.expiresAt) {
				t.Fatal("grant must expire after two minutes")
			}
		}
	}
	for i := 1; i <= 9; i++ {
		result := httptest.NewRecorder()
		router.ServeHTTP(result, httptest.NewRequest(http.MethodPost, "/api/auth/android-qr-login/unknown/redeem", nil))
		want := http.StatusUnauthorized
		if i == 9 {
			want = http.StatusTooManyRequests
		}
		if result.Code != want {
			t.Fatalf("redemption %d = %d, want %d", i, result.Code, want)
		}
	}
	// Each client IP gets its own budget.
	request := httptest.NewRequest(http.MethodPost, "/api/auth/android-qr-login", nil)
	request.RemoteAddr = "192.0.2.44:1234"
	result := httptest.NewRecorder()
	s.createAndroidQRLogin(result, request, actor)
	if result.Code != http.StatusCreated {
		t.Fatalf("different IP creation = %d", result.Code)
	}
}

func androidQRSetup(t *testing.T) (*Server, *httptest.Server, *http.Client, authResponse) {
	t.Helper()
	s, host, client := newTestServer(t)
	s.cfg.NativeClientOrigins = []string{"capacitor://localhost"}
	s.cfg.TrustedProxyCIDRs = []string{"127.0.0.1/32"}
	response := jsonRequest(t, client, http.MethodPost, host.URL+"/api/auth/setup", "", map[string]any{"familyName": "QR Family", "username": "qr-owner", "password": "secure-password", "displayName": "QR Owner"})
	if response.StatusCode != http.StatusCreated {
		t.Fatalf("setup = %d", response.StatusCode)
	}
	return s, host, client, decodeJSON[authResponse](t, response)
}

func androidQRCreate(t *testing.T, host *httptest.Server, client *http.Client, token string) androidQRGrantResponse {
	t.Helper()
	response := jsonRequest(t, client, http.MethodPost, host.URL+"/api/auth/android-qr-login", token, nil)
	if response.StatusCode != http.StatusCreated {
		t.Fatalf("grant creation = %d", response.StatusCode)
	}
	return decodeJSON[androidQRGrantResponse](t, response)
}

func androidQRRedeem(t *testing.T, host *httptest.Server, code, origin, ip string) *http.Response {
	t.Helper()
	request, err := http.NewRequest(http.MethodPost, host.URL+"/api/auth/android-qr-login/"+code+"/redeem", nil)
	if err != nil {
		t.Fatal(err)
	}
	request.Header.Set("Origin", origin)
	if ip != "" {
		request.Header.Set("X-Forwarded-For", ip)
	}
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	return response
}

func TestAndroidQRLoginLifecycle(t *testing.T) {
	for _, origin := range []string{"capacitor://localhost", "http://localhost:5173", "https://unconfigured.example.test", ""} {
		t.Run(origin, func(t *testing.T) {
			s, host, client, owner := androidQRSetup(t)
			before := time.Now()
			grant := androidQRCreate(t, host, client, owner.AccessToken)
			if grant.ExpiresAt.Before(before.Add(2*time.Minute)) || grant.ExpiresAt.After(time.Now().Add(2*time.Minute)) {
				t.Fatal("expiry is not two minutes")
			}
			var hash, familyID, userID string
			if err := s.sqlDB.QueryRow(`SELECT id_hash, family_id, user_id FROM android_qr_login_grants`).Scan(&hash, &familyID, &userID); err != nil {
				t.Fatal(err)
			}
			if hash == grant.RequestID || hash != tokenHash(s.cfg.RefreshTokenSecret, grant.RequestID) || familyID != owner.User.FamilyID || userID != owner.User.ID {
				t.Fatal("incorrect persisted grant binding/hash")
			}
			response := androidQRRedeem(t, host, grant.RequestID, origin, "192.0.2.5")
			if response.StatusCode != http.StatusOK {
				t.Fatalf("redemption = %d", response.StatusCode)
			}
			auth := decodeJSON[authResponse](t, response)
			if auth.User.ID != owner.User.ID || auth.AccessToken == "" || auth.TokenType != "Bearer" {
				t.Fatal("redemption did not issue bound user session")
			}
			if (auth.RefreshToken != "") != (origin == "capacitor://localhost") {
				t.Fatal("refresh token exposed to wrong origin or missing for native")
			}
			me := jsonRequest(t, client, http.MethodGet, host.URL+"/api/auth/me", auth.AccessToken, nil)
			if me.StatusCode != http.StatusOK {
				t.Fatalf("new session access = %d", me.StatusCode)
			}
			_ = me.Body.Close()
			var count int
			if err := s.sqlDB.QueryRow(`SELECT count(*) FROM refresh_tokens WHERE user_id = $1 AND ip_address = '192.0.2.5'`, owner.User.ID).Scan(&count); err != nil || count != 1 {
				t.Fatalf("new receiving session count = %d, error = %v", count, err)
			}
			reused := androidQRRedeem(t, host, grant.RequestID, origin, "192.0.2.5")
			defer reused.Body.Close()
			if reused.StatusCode != http.StatusUnauthorized {
				t.Fatalf("reused grant = %d", reused.StatusCode)
			}
		})
	}
}

func TestAndroidQRLoginRejectsUnavailableGrants(t *testing.T) {
	for _, reason := range []string{"expired", "inactive", "blocked IP", "wrong family", "another server"} {
		t.Run(reason, func(t *testing.T) {
			s, host, client, owner := androidQRSetup(t)
			grant := androidQRCreate(t, host, client, owner.AccessToken)
			var err error
			switch reason {
			case "expired":
				_, err = s.sqlDB.Exec(`UPDATE android_qr_login_grants SET expires_at = now() - interval '1 second'`)
			case "inactive":
				_, err = s.sqlDB.Exec(`UPDATE users SET is_active = 0 WHERE id = $1`, owner.User.ID)
			case "blocked IP":
				_, err = s.sqlDB.Exec(`INSERT INTO family_ip_bans (family_id, ip_address, target_user_id, created_by) VALUES ($1, '192.0.2.5', $2, $2)`, owner.User.FamilyID, owner.User.ID)
			case "wrong family":
				_, err = s.sqlDB.Exec(`INSERT INTO families (id, name, created_at, updated_at) VALUES ('other-family', 'Other', $1, $1)`, nowString())
				if err == nil {
					_, err = s.sqlDB.Exec(`UPDATE android_qr_login_grants SET family_id = 'other-family'`)
				}
			case "another server":
				// A receiving server with a different key cannot find the sender's hash.
				s.cfg.RefreshTokenSecret = "another-server-key"
			}
			if err != nil {
				t.Fatal(err)
			}
			response := androidQRRedeem(t, host, grant.RequestID, "capacitor://localhost", "192.0.2.5")
			defer response.Body.Close()
			if response.StatusCode != http.StatusUnauthorized {
				t.Fatalf("%s grant = %d", reason, response.StatusCode)
			}
			var count int
			if err := s.sqlDB.QueryRow(`SELECT count(*) FROM refresh_tokens WHERE ip_address = '192.0.2.5'`).Scan(&count); err != nil || count != 0 {
				t.Fatalf("rejected grant created %d sessions, error = %v", count, err)
			}
			if reason == "inactive" || reason == "blocked IP" || reason == "wrong family" {
				var consumed bool
				if err := s.sqlDB.QueryRow(`SELECT consumed_at IS NOT NULL FROM android_qr_login_grants`).Scan(&consumed); err != nil || !consumed {
					t.Fatalf("grant must be consumed before validation: %v", err)
				}
			}
		})
	}
}

func TestAndroidQRLoginRateLimits(t *testing.T) {
	_, host, client, owner := androidQRSetup(t)
	unauth := jsonRequest(t, client, http.MethodPost, host.URL+"/api/auth/android-qr-login", "", nil)
	if unauth.StatusCode != http.StatusUnauthorized {
		t.Fatalf("unauthenticated creation = %d", unauth.StatusCode)
	}
	_ = unauth.Body.Close()
	for i := 1; i <= 9; i++ {
		response := jsonRequest(t, client, http.MethodPost, host.URL+"/api/auth/android-qr-login", owner.AccessToken, nil)
		want := http.StatusCreated
		if i == 9 {
			want = http.StatusTooManyRequests
		}
		if response.StatusCode != want {
			t.Fatalf("creation %d = %d, want %d", i, response.StatusCode, want)
		}
		_ = response.Body.Close()
		response = androidQRRedeem(t, host, "unknown-server-grant", "capacitor://localhost", "")
		want = http.StatusUnauthorized
		if i == 9 {
			want = http.StatusTooManyRequests
		}
		if response.StatusCode != want {
			t.Fatalf("redemption %d = %d, want %d", i, response.StatusCode, want)
		}
		_ = response.Body.Close()
	}
}

func TestAndroidQRLoginConcurrentRedemption(t *testing.T) {
	s, host, client, owner := androidQRSetup(t)
	grant := androidQRCreate(t, host, client, owner.AccessToken)
	start := make(chan struct{})
	statuses := make(chan int, 2)
	var wg sync.WaitGroup
	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			request, err := http.NewRequest(http.MethodPost, host.URL+"/api/auth/android-qr-login/"+grant.RequestID+"/redeem", nil)
			if err != nil {
				statuses <- 0
				return
			}
			request.Header.Set("Origin", "capacitor://localhost")
			response, err := http.DefaultClient.Do(request)
			if err != nil {
				statuses <- 0
				return
			}
			_ = response.Body.Close()
			statuses <- response.StatusCode
		}()
	}
	close(start)
	wg.Wait()
	close(statuses)
	counts := map[int]int{}
	for status := range statuses {
		counts[status]++
	}
	if counts[http.StatusOK] != 1 || counts[http.StatusUnauthorized] != 1 {
		t.Fatalf("concurrent redemption outcomes = %v", counts)
	}
	var sessions int
	if err := s.sqlDB.QueryRow(`SELECT count(*) FROM refresh_tokens WHERE user_id = $1`, owner.User.ID).Scan(&sessions); err != nil || sessions != 2 {
		t.Fatalf("session count = %d, want setup + one redemption; error = %v", sessions, err)
	}
}
