package app

import (
	"net/http"
	"regexp"
	"strings"
	"time"
)

var clusterPrefixPattern = regexp.MustCompile(`^/s/[A-Za-z0-9_-]+$`)

func refreshCookiePath(r *http.Request) string {
	prefix := strings.TrimSpace(r.Header.Get("X-Forwarded-Prefix"))
	if clusterPrefixPattern.MatchString(prefix) {
		return prefix + "/api/auth"
	}
	return "/api/auth"
}

func (s *Server) setRefreshCookieForPath(w http.ResponseWriter, rawToken, path string) {
	http.SetCookie(w, &http.Cookie{
		Name:     s.cfg.RefreshCookieName,
		Value:    rawToken,
		Path:     path,
		HttpOnly: true,
		Secure:   s.cfg.IsProduction(),
		SameSite: http.SameSiteLaxMode,
		MaxAge:   int(s.cfg.RefreshTokenTTL.Seconds()),
	})
}

func (s *Server) clearRefreshCookie(w http.ResponseWriter, r *http.Request) {
	http.SetCookie(w, &http.Cookie{
		Name:     s.cfg.RefreshCookieName,
		Value:    "",
		Path:     refreshCookiePath(r),
		HttpOnly: true,
		Secure:   s.cfg.IsProduction(),
		SameSite: http.SameSiteLaxMode,
		MaxAge:   -1,
		Expires:  time.Unix(0, 0),
	})
}
