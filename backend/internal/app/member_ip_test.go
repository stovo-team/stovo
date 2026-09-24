package app

import (
	"context"
	"database/sql"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	socketio "github.com/doquangtan/socketio/v4"
	"github.com/go-chi/chi/v5"
	"stovo-messenger/backend/internal/config"
	featureidentity "stovo-messenger/backend/internal/features/identity"
	featureroles "stovo-messenger/backend/internal/features/roles"
	"stovo-messenger/backend/internal/ports"
	workruntime "stovo-messenger/backend/internal/runtime"
)

func TestNormalizeMemberBanIP(t *testing.T) {
	for _, test := range []struct {
		name  string
		input string
		want  string
		valid bool
	}{
		{name: "ipv4", input: "192.0.2.4", want: "192.0.2.4", valid: true},
		{name: "ipv6 canonical", input: "2001:0db8::1", want: "2001:db8::1", valid: true},
		{name: "whitespace", input: " 192.0.2.4 ", want: "192.0.2.4", valid: true},
		{name: "empty", input: "", valid: false},
		{name: "malformed", input: "192.0.2.999", valid: false},
		{name: "cidr rejected", input: "192.0.2.0/24", valid: false},
	} {
		t.Run(test.name, func(t *testing.T) {
			got, ok := normalizeMemberBanIP(test.input)
			if got != test.want || ok != test.valid {
				t.Fatalf("normalizeMemberBanIP(%q) = (%q, %v), want (%q, %v)", test.input, got, ok, test.want, test.valid)
			}
		})
	}
}

type fakeMemberIPStore struct {
	banned         map[string]bool
	candidate      string
	bannedByTarget map[string]string
}

type countingMemberIPStore struct {
	*fakeMemberIPStore
	lookups int
}

func (s *countingMemberIPStore) IsBanned(ctx context.Context, family, ip string) (bool, error) {
	s.lookups++
	return s.fakeMemberIPStore.IsBanned(ctx, family, ip)
}

func (s *fakeMemberIPStore) CandidateIP(context.Context, string) (string, error) {
	return s.candidate, nil
}
func (s *fakeMemberIPStore) IsBanned(_ context.Context, family, ip string) (bool, error) {
	return s.banned[family+"|"+ip], nil
}
func (s *fakeMemberIPStore) Ban(_ context.Context, family, target, ip, _ string) error {
	if s.banned[family+"|"+ip] {
		if s.bannedByTarget[target] == ip {
			return nil
		}
		return errMemberIPAlreadyBanned
	}
	s.banned[family+"|"+ip] = true
	s.bannedByTarget[target] = ip
	return nil
}
func (s *fakeMemberIPStore) Unban(_ context.Context, family, target string) (bool, error) {
	ip, ok := s.bannedByTarget[target]
	if ok {
		delete(s.banned, family+"|"+ip)
		delete(s.bannedByTarget, target)
	}
	return ok, nil
}
func (s *fakeMemberIPStore) BannedIP(_ context.Context, _, target string) (string, error) {
	ip, ok := s.bannedByTarget[target]
	if !ok {
		return "", sql.ErrNoRows
	}
	return ip, nil
}

type memberAuthStoreFake struct{ account featureidentity.LoginAccount }

func (s memberAuthStoreFake) LoginAccountByUsername(context.Context, string) (featureidentity.LoginAccount, error) {
	return s.account, nil
}
func (s memberAuthStoreFake) LoginAccountByID(context.Context, string) (featureidentity.LoginAccount, error) {
	return s.account, nil
}

type memberAuthStoreMapFake map[string]featureidentity.LoginAccount

func (s memberAuthStoreMapFake) LoginAccountByUsername(_ context.Context, username string) (featureidentity.LoginAccount, error) {
	for _, account := range s {
		if account.Username == username {
			return account, nil
		}
	}
	return featureidentity.LoginAccount{}, sql.ErrNoRows
}
func (s memberAuthStoreMapFake) LoginAccountByID(_ context.Context, id string) (featureidentity.LoginAccount, error) {
	account, ok := s[id]
	if !ok {
		return featureidentity.LoginAccount{}, sql.ErrNoRows
	}
	return account, nil
}

type memberRoleStoreFake struct{}

func (memberRoleStoreFake) UserRoleID(context.Context, string) (string, error) { return "", nil }
func (memberRoleStoreFake) Get(context.Context, string, string) (featureroles.Role, error) {
	return featureroles.Role{}, nil
}
func (memberRoleStoreFake) List(context.Context, string) ([]featureroles.Role, error) {
	return nil, nil
}
func (memberRoleStoreFake) Create(context.Context, featureroles.CreateCommand) error { return nil }
func (memberRoleStoreFake) Update(context.Context, featureroles.UpdateCommand) error { return nil }
func (memberRoleStoreFake) DeleteReplacingMembers(context.Context, string, string, string) error {
	return nil
}
func (memberRoleStoreFake) Assign(context.Context, string, string, string) error { return nil }

type memberCacheFake struct{ gets int }

func (s *memberCacheFake) Get(context.Context, string) (any, error) {
	s.gets++
	return nil, errors.New("cache miss")
}
func (*memberCacheFake) Set(context.Context, string, any, int) error           { return nil }
func (*memberCacheFake) Delete(context.Context, string) error                  { return nil }
func (*memberCacheFake) Exists(context.Context, string) (bool, error)          { return false, nil }
func (*memberCacheFake) Increment(context.Context, string, int) (int64, error) { return 1, nil }

type memberSessionWriterFake struct {
	session featureidentity.RefreshSession
}

func (s *memberSessionWriterFake) SessionByHash(context.Context, string) (featureidentity.RefreshSession, error) {
	return s.session, nil
}
func (*memberSessionWriterFake) CreateSession(context.Context, featureidentity.PersistedSession) error {
	return nil
}
func (*memberSessionWriterFake) RotateSession(context.Context, featureidentity.RotatedSession) error {
	return nil
}
func (*memberSessionWriterFake) RevokeSession(context.Context, string, string) error { return nil }
func (*memberSessionWriterFake) ChangePassword(context.Context, featureidentity.PasswordChange) error {
	return nil
}

func TestMemberAdminPolicyEnforcesFamilyAndProtectsSelfAndOwner(t *testing.T) {
	actor := userPublic{ID: "admin", FamilyID: "family-a", Role: "admin", Permissions: []string{permissionManageMembers}}
	cases := []struct {
		name    string
		target  userPublic
		inspect bool
		want    error
	}{
		{name: "same family inspection", target: userPublic{ID: "admin", FamilyID: "family-a", IsActive: true}, inspect: true},
		{name: "self mutation denied", target: userPublic{ID: "admin", FamilyID: "family-a", IsActive: true}, want: errForbidden},
		{name: "owner inspection allowed", target: userPublic{ID: "owner", FamilyID: "family-a", Role: ownerRole, IsActive: true}, inspect: true},
		{name: "owner mutation denied", target: userPublic{ID: "owner", FamilyID: "family-a", Role: ownerRole, IsActive: true}, want: errForbidden},
		{name: "family isolation", target: userPublic{ID: "member", FamilyID: "family-b", IsActive: true}, inspect: true, want: errNotFound},
		{name: "inactive target", target: userPublic{ID: "member", FamilyID: "family-a"}, inspect: true, want: errNotFound},
	}
	for _, test := range cases {
		t.Run(test.name, func(t *testing.T) {
			if got := authorizeMemberSafety(actor, test.target, test.inspect); !errors.Is(got, test.want) {
				t.Fatalf("authorizeMemberSafety error = %v, want %v", got, test.want)
			}
		})
	}
	if authorizeMemberSafety(userPublic{ID: "member", FamilyID: "family-a", IsActive: true}, userPublic{ID: "other", FamilyID: "family-a", IsActive: true}, true) != errForbidden {
		t.Fatal("member without manage_members permission could inspect admin details")
	}
}

func TestMemberIPDetailsAreRedactedForSelfAndOwner(t *testing.T) {
	actor := userPublic{ID: "admin", FamilyID: "family-a", Role: "owner"}
	base := memberAdminDetails{CandidateIP: ptrString("192.0.2.4"), CandidateIPBanned: true, BannedIP: ptrString("192.0.2.3")}
	for _, target := range []userPublic{
		{ID: "admin", FamilyID: "family-a"},
		{ID: "root", FamilyID: "family-a", Role: ownerRole},
	} {
		redacted := redactMemberIPDetails(actor, target, base)
		if redacted.CandidateIP != nil || redacted.CandidateIPBanned || redacted.BannedIP != nil {
			t.Fatalf("IP metadata was not redacted for target %#v: %#v", target, redacted)
		}
	}
}

func TestFamilyIPBanLookupCanonicalizesAndIsolatesFamily(t *testing.T) {
	store := &fakeMemberIPStore{banned: map[string]bool{"family-a|2001:db8::1": true}, bannedByTarget: map[string]string{}}
	server := &Server{memberIPs: store}
	blocked, err := server.isFamilyIPBanned(context.Background(), "family-a", "2001:0db8::1")
	if err != nil || !blocked {
		t.Fatalf("canonical IP blocked=%v error=%v, want blocked", blocked, err)
	}
	blocked, err = server.isFamilyIPBanned(context.Background(), "family-b", "2001:db8::1")
	if err != nil || blocked {
		t.Fatalf("cross-family IP blocked=%v error=%v, want allowed", blocked, err)
	}
	if _, err := server.isFamilyIPBanned(context.Background(), "family-a", "bad-ip"); err == nil {
		t.Fatal("malformed client IP was allowed through the ban check")
	}
	blocked, err = server.isFamilyIPBanned(context.Background(), "family-a", "")
	if err != nil || blocked {
		t.Fatalf("missing IP blocked=%v error=%v, want no-match", blocked, err)
	}
}

func TestSharedIPBanCollisionIsExplicitAndIdempotentForOwner(t *testing.T) {
	store := &fakeMemberIPStore{banned: map[string]bool{"family-a|192.0.2.4": true}, bannedByTarget: map[string]string{"member-1": "192.0.2.4"}}
	if err := store.Ban(context.Background(), "family-a", "member-2", "192.0.2.4", "admin"); !errors.Is(err, errMemberIPAlreadyBanned) {
		t.Fatalf("second target ban error = %v, want explicit conflict", err)
	}
	if err := store.Ban(context.Background(), "family-a", "member-1", "192.0.2.4", "admin"); err != nil {
		t.Fatalf("repeat ban for the same target/IP should be idempotent: %v", err)
	}
}

func ptrString(value string) *string { return &value }

func TestMemberAdminDetailsRetainStoredBanForManualLift(t *testing.T) {
	store := &fakeMemberIPStore{banned: map[string]bool{"family-a|192.0.2.4": true}, candidate: "198.51.100.9", bannedByTarget: map[string]string{"member": "192.0.2.4"}}
	server := &Server{memberIPs: store}
	member := userPublic{ID: "member", FamilyID: "family-a", IsActive: true, LastSeenVisibility: "nobody"}
	server.sessions = NewSessionRegistry()
	server.sessions.Register(userPublic{ID: member.ID}, &socketio.Socket{Id: "member-socket"})
	details, err := server.loadMemberAdminDetails(context.Background(), member)
	if err != nil {
		t.Fatal(err)
	}
	if details.CandidateIP == nil || *details.CandidateIP != "198.51.100.9" {
		t.Fatalf("candidate IP = %v", details.CandidateIP)
	}
	if details.BannedIP == nil || *details.BannedIP != "192.0.2.4" {
		t.Fatalf("stored banned IP = %v, want old IP available for lift confirmation", details.BannedIP)
	}
	if details.LastSeenAt != nil {
		t.Fatal("last seen exposed when member privacy setting is nobody")
	}
	if details.IsOnline {
		t.Fatal("online presence exposed when member privacy setting is nobody")
	}
	if details.CandidateIPBanned {
		t.Fatal("new candidate IP should not be marked blocked by an older ban")
	}
}

func TestPasswordDeviceAndRefreshRejectBlockedFamilyIP(t *testing.T) {
	passwordHash, err := hashPassword("correct horse")
	if err != nil {
		t.Fatal(err)
	}
	account := featureidentity.LoginAccount{ID: "member", FamilyID: "family-a", Username: "member", PasswordHash: passwordHash, DisplayName: "Member", Role: "member", IsActive: true, CreatedAt: "2026-01-01T00:00:00Z"}
	ipStore := &fakeMemberIPStore{banned: map[string]bool{"family-a|192.0.2.4": true}, bannedByTarget: map[string]string{}}
	cache := &memberCacheFake{}
	sessions := &memberSessionWriterFake{session: featureidentity.RefreshSession{UserID: "member", ExpiresAt: time.Now().Add(time.Hour).Format(time.RFC3339Nano)}}
	server := &Server{cfg: config.Config{RefreshTokenSecret: "secret"}, cache: cache, loginAccounts: featureidentity.NewLoginAccountService(memberAuthStoreFake{account}), roles: featureroles.NewService(memberRoleStoreFake{}), memberIPs: ipStore, sessionWriter: sessions}
	auth := server.authRoutes()

	loginRequest := httptest.NewRequest(http.MethodPost, "/api/auth/login", strings.NewReader(`{"username":"member","password":"correct horse"}`))
	loginRequest.RemoteAddr = "192.0.2.4:5555"
	loginRecorder := httptest.NewRecorder()
	auth.Login.ServeHTTP(loginRecorder, loginRequest)
	if loginRecorder.Code != http.StatusUnauthorized {
		t.Fatalf("password login status = %d, want 401", loginRecorder.Code)
	}

	deviceRequest := httptest.NewRequest(http.MethodPost, "/api/auth/device-login/verify", strings.NewReader(`{"username":"member","code":"123456"}`))
	deviceRequest.RemoteAddr = "192.0.2.4:5555"
	deviceRecorder := httptest.NewRecorder()
	auth.DeviceLoginVerify.ServeHTTP(deviceRecorder, deviceRequest)
	if deviceRecorder.Code != http.StatusUnauthorized {
		t.Fatalf("device verification status = %d, want 401", deviceRecorder.Code)
	}
	if cache.gets != 0 {
		t.Fatalf("device login checked code %d times for a blocked IP, want 0", cache.gets)
	}

	_, _, err = server.rotateRefreshToken(context.Background(), "valid-refresh", "192.0.2.4")
	if !errors.Is(err, errUnauthorized) {
		t.Fatalf("refresh result error = %v, want unauthorized", err)
	}
}

func TestMemberIPRecoveryOnlyAllowsInspectionAndLiftMethods(t *testing.T) {
	for _, test := range []struct {
		method, path string
		want         bool
	}{
		{http.MethodGet, "/api/family/members/user/admin-details", true},
		{http.MethodDelete, "/api/family/members/user/ip-ban", true},
		{http.MethodPut, "/api/family/members/user/ip-ban", false},
		{http.MethodGet, "/api/family/members", false},
		{http.MethodDelete, "/api/family/members/user", false},
	} {
		r := httptest.NewRequest(test.method, test.path, nil)
		if got := isMemberIPRecoveryRequest(r); got != test.want {
			t.Errorf("%s %s recovery = %v, want %v", test.method, test.path, got, test.want)
		}
	}

	account := featureidentity.LoginAccount{ID: "admin", FamilyID: "family-a", Username: "admin", DisplayName: "Admin", Role: "owner", IsActive: true, CreatedAt: "2026-01-01T00:00:00Z"}
	server := &Server{
		cfg:           config.Config{JWTSecret: "test-secret", AccessTokenTTL: time.Minute},
		loginAccounts: featureidentity.NewLoginAccountService(memberAuthStoreFake{account}),
		roles:         featureroles.NewService(memberRoleStoreFake{}),
		memberIPs:     &fakeMemberIPStore{banned: map[string]bool{"family-a|192.0.2.4": true}, bannedByTarget: map[string]string{}},
	}
	token, _, err := createAccessToken(server.cfg, server.userPublicFromLoginAccount(account))
	if err != nil {
		t.Fatal(err)
	}
	for _, test := range []struct {
		method, path string
		wantAllowed  bool
	}{
		{http.MethodGet, "/api/chats", false},
		{http.MethodGet, "/api/family/members/member/admin-details", true},
		{http.MethodDelete, "/api/family/members/member/ip-ban", true},
		{http.MethodPut, "/api/family/members/member/ip-ban", false},
	} {
		r := httptest.NewRequest(test.method, test.path, nil)
		r.RemoteAddr = "192.0.2.4:5555"
		r.Header.Set("Authorization", "Bearer "+token)
		_, err := server.currentUser(r)
		if allowed := err == nil; allowed != test.wantAllowed {
			t.Errorf("currentUser %s %s allowed=%v, want %v (error %v)", test.method, test.path, allowed, test.wantAllowed, err)
		}
	}
}

func TestSocketConnectionIPIsCheckedAgainstFamilyBan(t *testing.T) {
	store := &fakeMemberIPStore{banned: map[string]bool{"family-a|192.0.2.4": true}, bannedByTarget: map[string]string{}}
	server := &Server{memberIPs: store}
	user := userPublic{ID: "member", FamilyID: "family-a", IsActive: true}
	if err := server.authorizeSocketClientIP(context.Background(), user, "192.0.2.4"); !errors.Is(err, errUnauthorized) {
		t.Fatalf("socket from blocked IP error = %v, want unauthorized", err)
	}
	if err := server.authorizeSocketClientIP(context.Background(), user, "192.0.2.5"); err != nil {
		t.Fatalf("socket from allowed IP error = %v, want allowed", err)
	}
}

type barrierMemberIPStore struct {
	*fakeMemberIPStore
	lookupEntered chan struct{}
	releaseLookup chan struct{}
	once          sync.Once
}

func (s *barrierMemberIPStore) IsBanned(ctx context.Context, family, ip string) (bool, error) {
	s.once.Do(func() {
		close(s.lookupEntered)
		<-s.releaseLookup
	})
	return s.fakeMemberIPStore.IsBanned(ctx, family, ip)
}

func TestSocketRegistrationCannotRacePastCommittedIPBan(t *testing.T) {
	store := &barrierMemberIPStore{
		fakeMemberIPStore: &fakeMemberIPStore{banned: map[string]bool{}, candidate: "192.0.2.4", bannedByTarget: map[string]string{}},
		lookupEntered:     make(chan struct{}), releaseLookup: make(chan struct{}),
	}
	server := &Server{memberIPs: store, sessions: NewSessionRegistry()}
	user := userPublic{ID: "member", FamilyID: "family-a", IsActive: true}
	socket := &socketio.Socket{Id: "racing-socket"}
	connectDone := make(chan error, 1)
	setupEntered := make(chan struct{})
	releaseSetup := make(chan struct{})
	go func() {
		connectDone <- server.withSocketAdmission(context.Background(), user, socket, "192.0.2.4", func() {
			close(setupEntered)
			<-releaseSetup
		})
	}()
	<-store.lookupEntered

	banDone := make(chan error, 1)
	go func() {
		banDone <- server.banMemberIPAndDisconnect(context.Background(), "family-a", "member", "192.0.2.4", "admin")
	}()
	select {
	case err := <-banDone:
		t.Fatalf("ban completed while connection check was paused: %v", err)
	case <-time.After(25 * time.Millisecond):
	}
	close(store.releaseLookup)
	<-setupEntered
	select {
	case err := <-banDone:
		t.Fatalf("ban completed while connection setup was paused: %v", err)
	case <-time.After(25 * time.Millisecond):
	}
	close(releaseSetup)
	if err := <-connectDone; err != nil {
		t.Fatalf("connection setup = %v, want it to finish before the waiting ban sweeps", err)
	}
	if err := <-banDone; err != nil {
		t.Fatalf("ban = %v", err)
	}
	if server.sessions.IsOnline(user.ID) || len(server.sessions.SocketsForFamilyIP(user.FamilyID, "192.0.2.4")) != 0 {
		t.Fatal("socket remained registered after its IP ban committed")
	}
}

type memberIPMemoryBroker struct {
	mu          sync.Mutex
	subscribers map[string][]ports.EventHandler
	ready       chan string
}

func newMemberIPMemoryBroker() *memberIPMemoryBroker {
	return &memberIPMemoryBroker{subscribers: make(map[string][]ports.EventHandler), ready: make(chan string, 4)}
}

func (b *memberIPMemoryBroker) Publish(_ context.Context, channel string, event ports.Event) error {
	b.mu.Lock()
	handlers := append([]ports.EventHandler(nil), b.subscribers[channel]...)
	b.mu.Unlock()
	for _, handler := range handlers {
		if err := handler(event); err != nil {
			return err
		}
	}
	return nil
}

func (b *memberIPMemoryBroker) Subscribe(ctx context.Context, channel string, handler ports.EventHandler) error {
	b.mu.Lock()
	b.subscribers[channel] = append(b.subscribers[channel], handler)
	b.mu.Unlock()
	b.ready <- channel
	<-ctx.Done()
	return ctx.Err()
}

func TestFamilyIPBanRevokesSocketsAcrossBackendInstances(t *testing.T) {
	broker := newMemberIPMemoryBroker()
	store := &fakeMemberIPStore{banned: map[string]bool{}, candidate: "192.0.2.4", bannedByTarget: map[string]string{}}
	lifecycle := workruntime.NewLifecycle(context.Background())
	defer func() {
		lifecycle.Cancel()
		lifecycle.Wait()
	}()

	first := &Server{memberIPs: store, sessions: NewSessionRegistry(), broker: broker}
	second := &Server{memberIPs: store, sessions: NewSessionRegistry(), broker: broker, lifecycle: lifecycle}
	first.sessions.RegisterWithIP(userPublic{ID: "member-a", FamilyID: "family-a"}, &socketio.Socket{Id: "first-socket"}, "192.0.2.4")
	second.sessions.RegisterWithIP(userPublic{ID: "member-b", FamilyID: "family-a"}, &socketio.Socket{Id: "second-socket"}, "192.0.2.4")
	second.sessions.RegisterWithIP(userPublic{ID: "other-family", FamilyID: "family-b"}, &socketio.Socket{Id: "other-family-socket"}, "192.0.2.4")
	second.startMemberIPBanConsumer()
	select {
	case channel := <-broker.ready:
		if channel != brokerChannelMemberIPBans {
			t.Fatalf("subscribed channel = %q, want %q", channel, brokerChannelMemberIPBans)
		}
	case <-time.After(time.Second):
		t.Fatal("second backend did not start member IP ban subscription")
	}

	if err := first.banMemberIPAndDisconnect(context.Background(), "family-a", "member-a", "192.0.2.4", "admin"); err != nil {
		t.Fatalf("ban = %v", err)
	}
	if first.sessions.IsOnline("member-a") || second.sessions.IsOnline("member-b") {
		t.Fatal("same-family sockets remained registered on one of the backend instances")
	}
	if !second.sessions.IsOnline("other-family") {
		t.Fatal("revocation disconnected a same-IP socket belonging to another family")
	}
}

func TestMissedBanEventIsRecoveredByActiveSocketSweep(t *testing.T) {
	store := &countingMemberIPStore{fakeMemberIPStore: &fakeMemberIPStore{banned: map[string]bool{"family-a|192.0.2.4": true}, bannedByTarget: map[string]string{}}}
	server := &Server{memberIPs: store, sessions: NewSessionRegistry()}
	server.sessions.RegisterWithIP(userPublic{ID: "member-a", FamilyID: "family-a"}, &socketio.Socket{Id: "missed-event"}, "192.0.2.4")
	server.sessions.RegisterWithIP(userPublic{ID: "member-b", FamilyID: "family-a"}, &socketio.Socket{Id: "same-ip"}, "192.0.2.4")
	server.sessions.RegisterWithIP(userPublic{ID: "other-family", FamilyID: "family-b"}, &socketio.Socket{Id: "same-ip-other-family"}, "192.0.2.4")
	if err := server.sweepBannedMemberIPSockets(context.Background()); err != nil {
		t.Fatalf("active socket sweep = %v", err)
	}
	if len(server.sessions.SocketsForFamilyIP("family-a", "192.0.2.4")) != 0 {
		t.Fatal("active socket sweep left sessions alive after their backend missed Pub/Sub")
	}
	if !server.sessions.IsOnline("other-family") {
		t.Fatal("active socket sweep disconnected a same-IP socket from another family")
	}
	if store.lookups != 2 {
		t.Fatalf("active socket sweep performed %d IP checks, want one per unique family/IP pair (2)", store.lookups)
	}
}

func TestDelayedBanEventDoesNotDisconnectSocketAfterUnban(t *testing.T) {
	store := &fakeMemberIPStore{banned: map[string]bool{}, candidate: "192.0.2.4", bannedByTarget: map[string]string{}}
	server := &Server{memberIPs: store, sessions: NewSessionRegistry()}
	server.sessions.RegisterWithIP(userPublic{ID: "member", FamilyID: "family-a"}, &socketio.Socket{Id: "post-unban"}, "192.0.2.4")
	if err := server.handleMemberIPBanEvent(ports.Event{"type": "family_ip_banned", "family_id": "family-a", "ip": "192.0.2.4"}); err != nil {
		t.Fatalf("stale event handling = %v", err)
	}
	if !server.sessions.IsOnline("member") {
		t.Fatal("stale ban event disconnected a socket after the IP was unbanned")
	}
}

type failingBanLookupStore struct{ *fakeMemberIPStore }

func (s failingBanLookupStore) IsBanned(context.Context, string, string) (bool, error) {
	return false, errors.New("database unavailable")
}

func TestTrustedBanEventRevokesSocketsWhenDatabaseRecheckFails(t *testing.T) {
	server := &Server{
		memberIPs: failingBanLookupStore{fakeMemberIPStore: &fakeMemberIPStore{banned: map[string]bool{}, bannedByTarget: map[string]string{}}},
		sessions:  NewSessionRegistry(),
	}
	server.sessions.RegisterWithIP(userPublic{ID: "member", FamilyID: "family-a"}, &socketio.Socket{Id: "trusted-ban"}, "192.0.2.4")
	if err := server.handleMemberIPBanEvent(ports.Event{"type": "family_ip_banned", "family_id": "family-a", "ip": "192.0.2.4"}); err != nil {
		t.Fatalf("trusted ban event handling = %v, want successful fail-closed eviction", err)
	}
	if server.sessions.IsOnline("member") || len(server.sessions.SocketsForFamilyIP("family-a", "192.0.2.4")) != 0 {
		t.Fatal("trusted ban event left matching socket registered after database recheck failed")
	}
}

func TestActiveSocketSweepErrorDoesNotExposeIP(t *testing.T) {
	server := &Server{
		memberIPs: failingBanLookupStore{fakeMemberIPStore: &fakeMemberIPStore{banned: map[string]bool{}, bannedByTarget: map[string]string{}}},
		sessions:  NewSessionRegistry(),
	}
	server.sessions.RegisterWithIP(userPublic{ID: "member", FamilyID: "family-a"}, &socketio.Socket{Id: "private-ip"}, "192.0.2.4")
	err := server.sweepBannedMemberIPSockets(context.Background())
	if err == nil {
		t.Fatal("active socket sweep returned nil when its ban lookup failed")
	}
	if strings.Contains(err.Error(), "192.0.2.4") {
		t.Fatalf("active socket sweep error exposed raw IP: %v", err)
	}
}

type failingMemberIPBroker struct{ err error }

func (b failingMemberIPBroker) Publish(context.Context, string, ports.Event) error { return b.err }
func (failingMemberIPBroker) Subscribe(context.Context, string, ports.EventHandler) error {
	return errors.New("not used")
}

func TestBanIPPublishFailureReportsPersistedBan(t *testing.T) {
	store := &fakeMemberIPStore{banned: map[string]bool{}, candidate: "192.0.2.4", bannedByTarget: map[string]string{}}
	server := &Server{memberIPs: store, broker: failingMemberIPBroker{err: errors.New("redis unavailable")}}
	err := server.banMemberIPAndDisconnect(context.Background(), "family-a", "member", "192.0.2.4", "admin")
	if !errors.Is(err, errMemberIPBanPublish) {
		t.Fatalf("ban publish error = %v, want persisted-but-revocation-failed status", err)
	}
	if !store.banned["family-a|192.0.2.4"] {
		t.Fatal("IP ban was not persisted before broker publish failure")
	}
}

func TestBanMemberIPRouteExplainsPersistedBanWhenRemoteRevokeFails(t *testing.T) {
	actor := featureidentity.LoginAccount{ID: "owner", FamilyID: "family-a", Username: "owner", DisplayName: "Owner", Role: ownerRole, IsActive: true, CreatedAt: "2026-01-01T00:00:00Z"}
	target := featureidentity.LoginAccount{ID: "member", FamilyID: "family-a", Username: "member", DisplayName: "Member", Role: "member", IsActive: true, CreatedAt: "2026-01-01T00:00:00Z"}
	store := &fakeMemberIPStore{banned: map[string]bool{}, candidate: "192.0.2.4", bannedByTarget: map[string]string{}}
	cfg := config.Config{JWTSecret: "route-test-secret", AccessTokenTTL: 15 * time.Minute}
	server := &Server{
		cfg:           cfg,
		loginAccounts: featureidentity.NewLoginAccountService(memberAuthStoreMapFake{actor.ID: actor, target.ID: target}),
		roles:         featureroles.NewService(memberRoleStoreFake{}),
		memberIPs:     store,
		broker:        failingMemberIPBroker{err: errors.New("redis unavailable")},
	}
	token, _, err := createAccessToken(cfg, server.userPublicFromAccount(actor))
	if err != nil {
		t.Fatal(err)
	}
	routeCtx := chi.NewRouteContext()
	routeCtx.URLParams.Add("userId", target.ID)
	req := httptest.NewRequest(http.MethodPut, "/api/family/members/member/ip-ban", strings.NewReader(`{"ip":"192.0.2.4"}`))
	req.Header.Set("Authorization", "Bearer "+token)
	req.RemoteAddr = "198.51.100.10:5555"
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, routeCtx))
	recorder := httptest.NewRecorder()
	server.familyRoutes().BanMemberIP.ServeHTTP(recorder, req)
	if recorder.Code != http.StatusServiceUnavailable || !strings.Contains(recorder.Body.String(), "IP ban was saved") {
		t.Fatalf("ban route response = %d %s, want explicit saved-ban/revocation failure", recorder.Code, recorder.Body.String())
	}
	if !store.banned["family-a|192.0.2.4"] {
		t.Fatal("route returned publish failure without persisting the IP ban")
	}
}

func TestDeniedSocketIsDisconnectedWithoutRegistration(t *testing.T) {
	server := &Server{
		memberIPs: &fakeMemberIPStore{banned: map[string]bool{"family-a|192.0.2.4": true}, bannedByTarget: map[string]string{}},
		sessions:  NewSessionRegistry(),
	}
	user := userPublic{ID: "member", FamilyID: "family-a", IsActive: true}
	socket := &socketio.Socket{Id: "denied-socket"}
	if err := server.withSocketAdmission(context.Background(), user, socket, "192.0.2.4", nil); !errors.Is(err, errUnauthorized) {
		t.Fatalf("socket admission error = %v, want unauthorized", err)
	}
	if server.sessions.IsOnline(user.ID) || len(server.sessions.SocketsForUser(user.ID)) != 0 {
		t.Fatal("denied socket was registered")
	}
}

func TestBanMemberIPRouteDeniesSelfOwnerAndCrossFamilyTargets(t *testing.T) {
	actor := featureidentity.LoginAccount{ID: "family-owner", FamilyID: "family-a", Username: "owner", DisplayName: "Owner", Role: ownerRole, IsActive: true, CreatedAt: "2026-01-01T00:00:00Z"}
	accounts := memberAuthStoreMapFake{
		actor.ID:         actor,
		"other-owner":    {ID: "other-owner", FamilyID: "family-a", Username: "other-owner", DisplayName: "Other Owner", Role: ownerRole, IsActive: true, CreatedAt: "2026-01-01T00:00:00Z"},
		"foreign-member": {ID: "foreign-member", FamilyID: "family-b", Username: "foreign", DisplayName: "Foreign", Role: "member", IsActive: true, CreatedAt: "2026-01-01T00:00:00Z"},
	}
	cfg := config.Config{JWTSecret: "route-test-secret", AccessTokenTTL: 15 * time.Minute}
	server := &Server{
		cfg:           cfg,
		loginAccounts: featureidentity.NewLoginAccountService(accounts),
		roles:         featureroles.NewService(memberRoleStoreFake{}),
		memberIPs:     &fakeMemberIPStore{banned: map[string]bool{}, bannedByTarget: map[string]string{}},
	}
	token, _, err := createAccessToken(cfg, server.userPublicFromAccount(actor))
	if err != nil {
		t.Fatal(err)
	}
	for _, test := range []struct {
		name, targetID string
		want           int
	}{
		{name: "self", targetID: actor.ID, want: http.StatusForbidden},
		{name: "owner", targetID: "other-owner", want: http.StatusForbidden},
		{name: "cross family", targetID: "foreign-member", want: http.StatusNotFound},
	} {
		t.Run(test.name, func(t *testing.T) {
			routeCtx := chi.NewRouteContext()
			routeCtx.URLParams.Add("userId", test.targetID)
			req := httptest.NewRequest(http.MethodPut, "/api/family/members/"+test.targetID+"/ip-ban", strings.NewReader(`{"ip":"192.0.2.4"}`))
			req.Header.Set("Authorization", "Bearer "+token)
			req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, routeCtx))
			recorder := httptest.NewRecorder()
			server.familyRoutes().BanMemberIP.ServeHTTP(recorder, req)
			if recorder.Code != test.want {
				t.Fatalf("ban route status = %d, want %d; body=%s", recorder.Code, test.want, recorder.Body.String())
			}
		})
	}
}

func TestSessionRegistryTracksSocketsByExactClientIPForImmediateDisconnect(t *testing.T) {
	registry := NewSessionRegistry()
	banned := &socketio.Socket{Id: "blocked"}
	other := &socketio.Socket{Id: "other"}
	registry.RegisterWithIP(userPublic{ID: "member-a", FamilyID: "family-a"}, banned, "192.0.2.4")
	registry.RegisterWithIP(userPublic{ID: "member-b", FamilyID: "family-b"}, other, "192.0.2.4")
	if got := registry.DisconnectFamilyIP("family-a", "192.0.2.4"); got != 1 {
		t.Fatalf("disconnected socket count = %d, want matching family only", got)
	}
	registry.Unregister("member-a", "blocked")
	if got := registry.SocketsForFamilyIP("family-a", "192.0.2.4"); len(got) != 0 {
		t.Fatalf("sockets after disconnect = %#v, want none", got)
	}
}

func TestInviteAcceptanceRejectsBannedFamilyIPBeforeMutation(t *testing.T) {
	store := &fakeMemberIPStore{banned: map[string]bool{"family-a|192.0.2.4": true}, bannedByTarget: map[string]string{}}
	server := &Server{memberIPs: store}
	if err := server.rejectBannedInviteIP(context.Background(), "family-a", "192.0.2.4"); !errors.Is(err, errUnauthorized) {
		t.Fatalf("banned invite IP error = %v, want unauthorized", err)
	}
	if err := server.rejectBannedInviteIP(context.Background(), "family-a", "192.0.2.5"); err != nil {
		t.Fatalf("allowed invite IP error = %v", err)
	}
}
