package http

import (
	"net/http"
	"testing"
	"time"
)

func TestNewServerPreservesHandlerAddressAndDefaultTimeout(t *testing.T) {
	handler := http.HandlerFunc(func(http.ResponseWriter, *http.Request) {})
	server := NewServer(Config{Address: ":8080"}, handler)
	if server.Addr != ":8080" || server.Handler == nil || server.ReadHeaderTimeout != 10*time.Second {
		t.Fatalf("server=%+v", server)
	}
}
