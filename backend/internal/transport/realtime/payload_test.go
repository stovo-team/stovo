package realtime

import (
	"testing"

	socketio "github.com/doquangtan/socketio/v4"
)

func TestPayloadHelpersPreserveSocketContract(t *testing.T) {
	var decoded struct {
		ChatID string `json:"chatId"`
	}
	if err := DecodePayload(map[string]any{"chatId": "chat-1"}, &decoded); err != nil || decoded.ChatID != "chat-1" {
		t.Fatalf("DecodePayload() = %#v, %v", decoded, err)
	}
	if got := MapPayload(map[string]any{"value": "echo"}); got["value"] != "echo" {
		t.Fatalf("MapPayload() = %#v", got)
	}
	id := "client-1"
	if got := ErrorPayload(&id, "bad payload"); got["message"] != "bad payload" || got["clientMessageId"] != id {
		t.Fatalf("ErrorPayload() = %#v", got)
	}
	if got := ErrorAck(&id, "bad payload"); got["ok"] != false || got["clientMessageId"] != &id {
		t.Fatalf("ErrorAck() = %#v", got)
	}
}

func TestAccessTokenPrefersAuthThenQuery(t *testing.T) {
	authSocket := &socketio.Socket{}
	authSocket.Handshake.Auth.Token = "auth-token"
	authSocket.Handshake.URL = "http://localhost/socket.io/?token=query-token"
	if got := AccessToken(authSocket); got != "auth-token" {
		t.Fatalf("AccessToken(auth) = %q", got)
	}
	querySocket := &socketio.Socket{}
	querySocket.Handshake.URL = "http://localhost/socket.io/?token=query-token"
	if got := AccessToken(querySocket); got != "query-token" {
		t.Fatalf("AccessToken(query) = %q", got)
	}
	if got := QueryValue(querySocket, "token"); got != "query-token" {
		t.Fatalf("QueryValue() = %q", got)
	}
}
