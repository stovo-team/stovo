package http

import (
	"context"
	stdhttp "net/http"
)

// ICEServer and ICEServerResponse are transport-owned WebRTC discovery DTOs.
type ICEServer struct {
	URLs       []string `json:"urls"`
	Username   string   `json:"username,omitempty"`
	Credential string   `json:"credential,omitempty"`
}
type ICEServerResponse struct {
	ICEServers []ICEServer `json:"iceServers"`
}
type ICEServerActor struct{ UserID, FamilyID string }
type ICEServerOperations struct {
	Resolve func(context.Context, ICEServerActor) ([]ICEServer, error)
}
type ICEServerHandler struct{ operations ICEServerOperations }

func NewICEServerHandler(operations ICEServerOperations) ICEServerHandler {
	return ICEServerHandler{operations}
}
func (h ICEServerHandler) Get(w stdhttp.ResponseWriter, r *stdhttp.Request, actor ICEServerActor) {
	servers, err := h.operations.Resolve(r.Context(), actor)
	if err != nil {
		writeFamilyReadJSON(w, stdhttp.StatusInternalServerError, map[string]string{"detail": "Could not load ICE servers"})
		return
	}
	writeFamilyReadJSON(w, stdhttp.StatusOK, ICEServerResponse{ICEServers: servers})
}
