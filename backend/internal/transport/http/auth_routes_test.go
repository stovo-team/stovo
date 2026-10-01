package http

import (
	stdhttp "net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
)

func TestRegisterAuthRoutesPreservesMethodsAndPaths(t *testing.T) {
	router := chi.NewRouter()
	handler := stdhttp.HandlerFunc(func(w stdhttp.ResponseWriter, r *stdhttp.Request) {
		w.Header().Set("X-Auth-Route", r.Method+" "+r.URL.Path)
		w.WriteHeader(stdhttp.StatusNoContent)
	})
	routes := AuthRoutes{
		SetupStatus: handler, Setup: handler, Login: handler, DeviceLoginRequest: handler,
		DeviceLoginVerify: handler, Refresh: handler, Logout: handler, Me: handler,
		PasskeyRegistrationOptions: handler, PasskeyRegistrationVerify: handler,
		PasskeyAuthenticationOptions: handler, PasskeyAuthenticationVerify: handler,
		QRLoginCreate: handler, QRLoginStatus: handler, QRLoginApprove: handler, QRLoginReject: handler,
		UpdateMe: handler, ChangePassword: handler, ListBlocks: handler, BlockUser: handler,
		UnblockUser: handler, GetAudioSettings: handler, PutAudioSettings: handler,
		GetNotificationTopic: handler,
	}
	RegisterAuthRoutes(router, routes)

	for _, request := range []struct{ method, path string }{
		{stdhttp.MethodGet, "/api/auth/setup-status"},
		{stdhttp.MethodPost, "/api/auth/setup"},
		{stdhttp.MethodPost, "/api/auth/login"},
		{stdhttp.MethodPost, "/api/auth/device-login/request"},
		{stdhttp.MethodPost, "/api/auth/device-login/verify"},
		{stdhttp.MethodPost, "/api/auth/passkeys/registration/options"},
		{stdhttp.MethodPost, "/api/auth/passkeys/registration/verify"},
		{stdhttp.MethodPost, "/api/auth/passkeys/authentication/options"},
		{stdhttp.MethodPost, "/api/auth/passkeys/authentication/verify"},
		{stdhttp.MethodPost, "/api/auth/qr-login"},
		{stdhttp.MethodGet, "/api/auth/qr-login/request-1"},
		{stdhttp.MethodPost, "/api/auth/qr-login/request-1/approve"},
		{stdhttp.MethodPost, "/api/auth/qr-login/request-1/reject"},
		{stdhttp.MethodPost, "/api/auth/refresh"},
		{stdhttp.MethodPost, "/api/auth/logout"},
		{stdhttp.MethodGet, "/api/auth/me"},
		{stdhttp.MethodPatch, "/api/auth/me"},
		{stdhttp.MethodPost, "/api/auth/change-password"},
		{stdhttp.MethodGet, "/api/privacy/blocks"},
		{stdhttp.MethodPost, "/api/privacy/blocks/user-1"},
		{stdhttp.MethodDelete, "/api/privacy/blocks/user-1"},
		{stdhttp.MethodGet, "/api/auth/audio-settings"},
		{stdhttp.MethodPut, "/api/auth/audio-settings"},
		{stdhttp.MethodGet, "/api/notifications/topic"},
	} {
		t.Run(request.method+request.path, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			router.ServeHTTP(recorder, httptest.NewRequest(request.method, request.path, nil))
			if recorder.Code != stdhttp.StatusNoContent {
				t.Fatalf("status=%d, want %d", recorder.Code, stdhttp.StatusNoContent)
			}
			if recorder.Header().Get("X-Auth-Route") != request.method+" "+request.path {
				t.Fatalf("handler not invoked for %s %s", request.method, request.path)
			}
		})
	}
}

func TestRegisterAuthRoutesRejectsWrongMethod(t *testing.T) {
	router := chi.NewRouter()
	handler := stdhttp.HandlerFunc(func(stdhttp.ResponseWriter, *stdhttp.Request) {})
	RegisterAuthRoutes(router, AuthRoutes{
		SetupStatus: handler, Setup: handler, Login: handler, DeviceLoginRequest: handler,
		DeviceLoginVerify: handler, Refresh: handler, Logout: handler, Me: handler,
		PasskeyRegistrationOptions: handler, PasskeyRegistrationVerify: handler,
		PasskeyAuthenticationOptions: handler, PasskeyAuthenticationVerify: handler,
		QRLoginCreate: handler, QRLoginStatus: handler, QRLoginApprove: handler, QRLoginReject: handler,
		UpdateMe: handler, ChangePassword: handler, ListBlocks: handler, BlockUser: handler,
		UnblockUser: handler, GetAudioSettings: handler, PutAudioSettings: handler,
		GetNotificationTopic: handler,
	})
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, httptest.NewRequest(stdhttp.MethodDelete, "/api/auth/login", nil))
	if recorder.Code != stdhttp.StatusMethodNotAllowed {
		t.Fatalf("status=%d, want %d", recorder.Code, stdhttp.StatusMethodNotAllowed)
	}
}
