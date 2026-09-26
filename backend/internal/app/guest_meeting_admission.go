package app

import (
	"net/http"
	"strings"
)

func guestMeetingAdmissionState(mode, creatorID, authenticatedUserID string) string {
	if mode == "immediate" || (authenticatedUserID != "" && authenticatedUserID == creatorID) {
		return "admitted"
	}
	return "waiting"
}

func guestMeetingRequestAdmissionState(r *http.Request, mode, creatorID string, resolveCurrentUser func(*http.Request) (userPublic, error)) string {
	authenticatedUserID := ""
	if strings.HasPrefix(strings.TrimSpace(r.Header.Get("Authorization")), "Bearer ") {
		if user, err := resolveCurrentUser(r); err == nil {
			authenticatedUserID = user.ID
		}
	}
	return guestMeetingAdmissionState(mode, creatorID, authenticatedUserID)
}

func guestMeetingChatTypeAllowed(chatType string) bool {
	return chatType == "family" || chatType == "group" || chatType == "voice"
}
