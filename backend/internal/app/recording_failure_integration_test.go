package app

import (
	"io"
	"net/http"
	"strings"
	"testing"
)

func TestRecordingFailureEndpointPersistsFailureAndProtectsRecordingIdentity(t *testing.T) {
	server, serverURL, ownerClient := newTestServer(t)
	setupResp := jsonRequest(t, ownerClient, http.MethodPost, serverURL.URL+"/api/auth/setup", "", map[string]any{
		"familyName":  "Recording failure family",
		"username":    "recording-failure-owner",
		"password":    "secure-password",
		"displayName": "Recording Failure Owner",
	})
	if setupResp.StatusCode != http.StatusCreated {
		t.Fatalf("setup status = %d, want %d", setupResp.StatusCode, http.StatusCreated)
	}
	owner := decodeJSON[authResponse](t, setupResp)
	member := createInvitedUser(t, ownerClient, serverURL.URL, owner, "recording-failure-member")

	chatResp := jsonRequest(t, ownerClient, http.MethodPost, serverURL.URL+"/api/chats/direct", owner.AccessToken, map[string]any{"userId": member.User.ID})
	if chatResp.StatusCode != http.StatusCreated {
		t.Fatalf("create direct chat status = %d, want %d", chatResp.StatusCode, http.StatusCreated)
	}
	chat := decodeJSON[chatPublic](t, chatResp)
	roomID := "recording-failure-room"
	server.indexCallSession(&callSession{
		ID:           roomID,
		ChatID:       chat.ID,
		CallerUserID: owner.User.ID,
		Participants: map[string]*callParticipant{
			owner.User.ID: {UserID: owner.User.ID, Role: "host", State: participantConnected},
		},
	})

	startRecording := func() string {
		t.Helper()
		resp := jsonRequest(t, ownerClient, http.MethodPost, serverURL.URL+"/api/calls/"+roomID+"/recording/start", owner.AccessToken, nil)
		if resp.StatusCode != http.StatusCreated {
			t.Fatalf("start recording status = %d, want %d", resp.StatusCode, http.StatusCreated)
		}
		return decodeJSON[map[string]any](t, resp)["id"].(string)
	}
	failRecording := func(token, recordingID, message string) *http.Response {
		t.Helper()
		return jsonRequest(t, ownerClient, http.MethodPost, serverURL.URL+"/api/calls/"+roomID+"/recording/fail", token, map[string]any{
			"recordingId": recordingID,
			"message":     message,
		})
	}
	getRecordingStatus := func() callRecordingPublic {
		t.Helper()
		resp := jsonRequest(t, ownerClient, http.MethodGet, serverURL.URL+"/api/calls/"+roomID+"/recording/status", owner.AccessToken, nil)
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("recording status response = %d, want %d", resp.StatusCode, http.StatusOK)
		}
		return decodeJSON[callRecordingPublic](t, resp)
	}

	firstID := startRecording()
	unauthorized := failRecording("", firstID, "No video frames were captured")
	if unauthorized.StatusCode != http.StatusUnauthorized {
		t.Fatalf("unauthenticated failure status = %d, want %d; body=%s", unauthorized.StatusCode, http.StatusUnauthorized, readRecordingFailureResponseBody(t, unauthorized))
	}
	_ = unauthorized.Body.Close()
	nonParticipant := failRecording(member.AccessToken, firstID, "No video frames were captured")
	if nonParticipant.StatusCode != http.StatusForbidden {
		t.Fatalf("nonparticipant failure status = %d, want %d; body=%s", nonParticipant.StatusCode, http.StatusForbidden, readRecordingFailureResponseBody(t, nonParticipant))
	}
	_ = nonParticipant.Body.Close()

	failureMessage := "No video frames were captured"
	failed := failRecording(owner.AccessToken, firstID, failureMessage)
	if failed.StatusCode != http.StatusOK {
		t.Fatalf("failure endpoint status = %d, want %d; body=%s", failed.StatusCode, http.StatusOK, readRecordingFailureResponseBody(t, failed))
	}
	_ = failed.Body.Close()
	status := getRecordingStatus()
	if status.ID != firstID || status.Status != "failed" || status.FailureMessage == nil || *status.FailureMessage != failureMessage {
		t.Fatalf("persisted recording status = %#v, want failed status and message %q", status, failureMessage)
	}

	repeated := failRecording(owner.AccessToken, firstID, failureMessage)
	if repeated.StatusCode < 200 || repeated.StatusCode >= 300 {
		t.Fatalf("repeated failure status = %d, want a successful idempotent response; body=%s", repeated.StatusCode, readRecordingFailureResponseBody(t, repeated))
	}
	_ = repeated.Body.Close()
	if got := getRecordingStatus(); got.Status != "failed" || got.FailureMessage == nil || *got.FailureMessage != failureMessage {
		t.Fatalf("repeated failure changed persisted state: %#v", got)
	}

	secondID := startRecording()
	unknown := failRecording(owner.AccessToken, "unknown-recording-id", "stale failure")
	if unknown.StatusCode < 400 || unknown.StatusCode >= 500 {
		t.Fatalf("unknown recording failure status = %d, want a client error; body=%s", unknown.StatusCode, readRecordingFailureResponseBody(t, unknown))
	}
	_ = unknown.Body.Close()
	stale := failRecording(owner.AccessToken, firstID, "stale failure")
	if stale.StatusCode < 400 || stale.StatusCode >= 500 {
		t.Fatalf("mismatched recording failure status = %d, want a client error; body=%s", stale.StatusCode, readRecordingFailureResponseBody(t, stale))
	}
	_ = stale.Body.Close()
	malformedUpload, err := http.NewRequest(http.MethodPost, serverURL.URL+"/api/calls/"+roomID+"/recording/upload", strings.NewReader("--broken-boundary\r\nContent-Disposition: form-data; name=\"file\"\r\n"))
	if err != nil {
		t.Fatalf("create malformed upload request: %v", err)
	}
	malformedUpload.Header.Set("Authorization", "Bearer "+owner.AccessToken)
	malformedUpload.Header.Set("Content-Type", "multipart/form-data; boundary=broken-boundary")
	malformedResponse, err := ownerClient.Do(malformedUpload)
	if err != nil {
		t.Fatalf("send malformed upload: %v", err)
	}
	if malformedResponse.StatusCode < 400 || malformedResponse.StatusCode >= 500 {
		t.Fatalf("malformed upload status = %d, want a client error; body=%s", malformedResponse.StatusCode, readRecordingFailureResponseBody(t, malformedResponse))
	}
	_ = malformedResponse.Body.Close()
	current := getRecordingStatus()
	if current.ID != secondID || current.Status != "recording" || (current.FailureMessage != nil && strings.TrimSpace(*current.FailureMessage) != "") {
		t.Fatalf("stale failure altered the newer recording: %#v", current)
	}
}

func readRecordingFailureResponseBody(t *testing.T, resp *http.Response) string {
	t.Helper()
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("read response body: %v", err)
	}
	return string(body)
}
