package runtime

import "time"

// CallState, CallTopology and CallParticipantState are runtime lifecycle
// values. They are intentionally transport-neutral strings so HTTP and
// Socket.IO presenters can preserve their existing wire formats.
type CallState string

const (
	CallStateRinging    CallState = "ringing"
	CallStateConnecting CallState = "connecting"
	CallStateConnected  CallState = "connected"
)

type CallTopology string

const (
	CallTopologyMesh CallTopology = "mesh"
	CallTopologySFU  CallTopology = "sfu"
)

type CallParticipantState string

const (
	ParticipantInvited    CallParticipantState = "invited"
	ParticipantRinging    CallParticipantState = "ringing"
	ParticipantConnecting CallParticipantState = "connecting"
	ParticipantConnected  CallParticipantState = "connected"
	ParticipantLeft       CallParticipantState = "left"
	ParticipantDeclined   CallParticipantState = "declined"
)

type CallParticipant struct {
	UserID   string               `json:"userId"`
	Role     string               `json:"role"`
	State    CallParticipantState `json:"state"`
	JoinedAt time.Time            `json:"joinedAt,omitempty"`
}
type CallSession struct {
	ID           string                      `json:"id"`
	ChatID       string                      `json:"chatId"`
	CallerUserID string                      `json:"callerId"`
	CalleeUserID string                      `json:"calleeId"`
	CallType     string                      `json:"callType"`
	Topology     CallTopology                `json:"topology"`
	State        CallState                   `json:"state"`
	Participants map[string]*CallParticipant `json:"participants"`
	CreatedAt    time.Time                   `json:"createdAt"`
	ConnectedAt  time.Time                   `json:"connectedAt"`
	ExpiresAt    time.Time                   `json:"expiresAt"`
}

func (s *CallSession) ParticipantIDs() []string {
	ids := make([]string, 0, len(s.Participants))
	for id := range s.Participants {
		ids = append(ids, id)
	}
	return ids
}
func (s *CallSession) ActiveParticipantIDs() []string {
	ids := make([]string, 0, len(s.Participants))
	for id, p := range s.Participants {
		if p != nil && p.State != ParticipantLeft && p.State != ParticipantDeclined {
			ids = append(ids, id)
		}
	}
	return ids
}
func (s *CallSession) ConnectedOrConnectingCount() int {
	count := 0
	for _, p := range s.Participants {
		if p != nil && (p.State == ParticipantConnected || p.State == ParticipantConnecting) {
			count++
		}
	}
	return count
}
func (s *CallSession) RingingInviteeIDs() []string {
	ids := make([]string, 0)
	for id, p := range s.Participants {
		if p != nil && (p.State == ParticipantRinging || p.State == ParticipantInvited) && p.Role != "host" {
			ids = append(ids, id)
		}
	}
	return ids
}
func (s *CallSession) HasLiveParticipants() bool {
	for _, p := range s.Participants {
		if p != nil && p.State != ParticipantLeft && p.State != ParticipantDeclined {
			return true
		}
	}
	return false
}
func (s *CallSession) IsParticipant(userID string) bool {
	p, ok := s.Participants[userID]
	return ok && p != nil && p.State != ParticipantLeft && p.State != ParticipantDeclined
}
func (s *CallSession) HasParticipant(userID string) bool { _, ok := s.Participants[userID]; return ok }
func (s *CallSession) PublicParticipants() []map[string]any {
	out := make([]map[string]any, 0, len(s.Participants))
	for _, p := range s.Participants {
		if p == nil {
			continue
		}
		item := map[string]any{"userId": p.UserID, "role": p.Role, "state": string(p.State)}
		if !p.JoinedAt.IsZero() {
			item["joinedAt"] = p.JoinedAt.Format(time.RFC3339Nano)
		}
		out = append(out, item)
	}
	return out
}
func (s *CallSession) PublicPayload() map[string]any {
	return map[string]any{"roomId": s.ID, "chatId": s.ChatID, "callerId": s.CallerUserID, "calleeId": s.CalleeUserID, "callType": s.CallType, "topology": string(s.Topology), "state": string(s.State), "createdAt": s.CreatedAt.Format(time.RFC3339Nano), "expiresAt": s.ExpiresAt.Format(time.RFC3339Nano), "participants": s.PublicParticipants()}
}
func (s *CallSession) ActionPayload(extra map[string]any) map[string]any {
	payload := s.PublicPayload()
	payload["sessionStartedAt"] = s.CreatedAt.Format(time.RFC3339Nano)
	for k, v := range extra {
		payload[k] = v
	}
	return payload
}
