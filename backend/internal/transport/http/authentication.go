package http

import (
	stdhttp "net/http"
)

// PrincipalResolver is the transport-facing authentication seam.  The
// transport deliberately treats a principal as an opaque value: decoding a
// token and loading an account are application concerns, while converting a
// failed authentication attempt into the stable HTTP response is an inbound
// transport concern.
type PrincipalResolver func(*stdhttp.Request) (any, error)

// Authenticated adapts a principal-aware endpoint to net/http.  Keeping this
// small bridge in the HTTP package prevents every route family from owning a
// slightly different unauthorized response.
func Authenticated(resolve PrincipalResolver, next func(stdhttp.ResponseWriter, *stdhttp.Request, any)) stdhttp.HandlerFunc {
	return func(w stdhttp.ResponseWriter, r *stdhttp.Request) {
		principal, err := resolve(r)
		if err != nil {
			writeAuthenticationDetail(w, stdhttp.StatusUnauthorized, "Authentication required")
			return
		}
		next(w, r, principal)
	}
}

func writeAuthenticationDetail(w stdhttp.ResponseWriter, status int, detail string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_, _ = w.Write([]byte(`{"detail":"` + detail + `"}`))
}
