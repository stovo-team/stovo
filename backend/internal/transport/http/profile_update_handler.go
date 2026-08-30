package http

import (
	"context"
	"encoding/json"
	stdhttp "net/http"
	"strings"
)

// ProfileUpdateRequest is the transport contract for PATCH /api/auth/me.
// It purposefully contains no app, Ent, or feature persistence types.
type ProfileUpdateRequest struct {
	DisplayName *string `json:"displayName"`; PublicKey *string `json:"publicKey"`; ProfilePhotoFileID *string `json:"profilePhotoFileId"`
	ProfileVisibility *string `json:"profileVisibility"`; LastSeenVisibility *string `json:"lastSeenVisibility"`; ReadReceiptsEnabled *bool `json:"readReceiptsEnabled"`
	DirectMessagePermission *string `json:"directMessagePermission"`; GroupInvitePermission *string `json:"groupInvitePermission"`; ChannelInvitePermission *string `json:"channelInvitePermission"`; VoiceInvitePermission *string `json:"voiceInvitePermission"`; InvitePermissionUserIDs *[]string `json:"invitePermissionUserIds"`
	Email *string `json:"email"`; Bio *string `json:"bio"`; Timezone *string `json:"timezone"`
}

type ProfileUpdateHandler struct {
	Validate func(context.Context, ProfileUpdateRequest) (int, string, error)
	Update func(context.Context, ProfileUpdateRequest) (any, error)
}

func (h ProfileUpdateHandler) ServeHTTP(w stdhttp.ResponseWriter, r *stdhttp.Request) {
	var request ProfileUpdateRequest
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil { writeProfileDetail(w, stdhttp.StatusUnprocessableEntity, "Invalid request body"); return }
	request.normalize()
	if request.empty() { writeProfileDetail(w, stdhttp.StatusUnprocessableEntity, "A profile or privacy setting is required"); return }
	if request.DisplayName != nil && *request.DisplayName == "" { writeProfileDetail(w, stdhttp.StatusUnprocessableEntity, "displayName cannot be blank"); return }
	if h.Validate != nil { if status, detail, err := h.Validate(r.Context(), request); err != nil { writeProfileDetail(w, status, detail); return } }
	value, err := h.Update(r.Context(), request)
	if err != nil { writeProfileDetail(w, stdhttp.StatusInternalServerError, "Could not update profile"); return }
	writeProfileJSON(w, stdhttp.StatusOK, value)
}
func (r *ProfileUpdateRequest) normalize() { for _, p := range []*string{r.DisplayName,r.PublicKey,r.ProfilePhotoFileID,r.Email,r.Bio,r.Timezone} { if p != nil { v:=strings.TrimSpace(*p); *p=v } } }
func (r ProfileUpdateRequest) empty() bool { return r.DisplayName==nil && r.PublicKey==nil && r.ProfilePhotoFileID==nil && r.ProfileVisibility==nil && r.LastSeenVisibility==nil && r.ReadReceiptsEnabled==nil && r.DirectMessagePermission==nil && r.GroupInvitePermission==nil && r.ChannelInvitePermission==nil && r.VoiceInvitePermission==nil && r.InvitePermissionUserIDs==nil && r.Email==nil && r.Bio==nil && r.Timezone==nil }
func writeProfileJSON(w stdhttp.ResponseWriter, status int, value any) { w.Header().Set("Content-Type","application/json"); w.WriteHeader(status); _=json.NewEncoder(w).Encode(value) }
func writeProfileDetail(w stdhttp.ResponseWriter, status int, detail string) { writeProfileJSON(w,status,map[string]string{"detail":detail}) }
