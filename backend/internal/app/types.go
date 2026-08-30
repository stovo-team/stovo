package app

import (
	"time"

	httptransport "stovo-messenger/backend/internal/transport/http"
	chatpresenter "stovo-messenger/backend/internal/transport/http/presenter"
	realtimetransport "stovo-messenger/backend/internal/transport/realtime"
)

type userPublic struct {
	ID                      string      `json:"id"`
	FamilyID                string      `json:"familyId"`
	Username                string      `json:"username"`
	DisplayName             string      `json:"displayName"`
	Role                    string      `json:"role"`
	RoleID                  string      `json:"roleId,omitempty"`
	RoleName                string      `json:"roleName,omitempty"`
	Permissions             []string    `json:"permissions,omitempty"`
	IsActive                bool        `json:"isActive"`
	PublicKey               *string     `json:"publicKey"`
	ProfilePhoto            *filePublic `json:"profilePhoto"`
	CreatedAt               *time.Time  `json:"createdAt,omitempty"`
	LastSeenAt              *time.Time  `json:"lastSeenAt"`
	ProfileVisibility       string      `json:"profileVisibility"`
	LastSeenVisibility      string      `json:"lastSeenVisibility"`
	ReadReceiptsEnabled     bool        `json:"readReceiptsEnabled"`
	DirectMessagePermission string      `json:"directMessagePermission"`
	GroupInvitePermission   string      `json:"groupInvitePermission"`
	ChannelInvitePermission string      `json:"channelInvitePermission"`
	VoiceInvitePermission   string      `json:"voiceInvitePermission"`
	InvitePermissionUserIDs []string    `json:"invitePermissionUserIds"`
	Email                   *string     `json:"email"`
	Bio                     *string     `json:"bio"`
	Timezone                *string     `json:"timezone"`
}

type NavTabsConfig struct {
	Chats    bool `json:"chats"`
	Storage  bool `json:"storage"`
	Plans    bool `json:"plans"`
	Settings bool `json:"settings"`
}

type familyPublic struct {
	ID                               string        `json:"id"`
	Name                             string        `json:"name"`
	StorageLimitMB                   *int64        `json:"storageLimitMb"`
	MinimizedChatLayout              bool          `json:"minimizedChatLayout"`
	DefaultMessageEncryptionProtocol string        `json:"defaultMessageEncryptionProtocol"`
	DefaultProfileVisibility         string        `json:"defaultProfileVisibility"`
	DefaultLastSeenVisibility        string        `json:"defaultLastSeenVisibility"`
	DefaultReadReceiptsEnabled       bool          `json:"defaultReadReceiptsEnabled"`
	DefaultNotificationSettings      string        `json:"defaultNotificationSettings"`
	NavTabs                          NavTabsConfig `json:"navTabs"`
	PublicAppURL                     *string       `json:"-"`
	PublicAPIURL                     *string       `json:"-"`
}

type invitePublic struct {
	ID        string     `json:"id"`
	FamilyID  string     `json:"familyId"`
	Role      string     `json:"role"`
	ExpiresAt time.Time  `json:"expiresAt"`
	MaxUses   int        `json:"maxUses"`
	UsedCount int        `json:"usedCount"`
	CreatedBy string     `json:"createdBy"`
	CreatedAt time.Time  `json:"createdAt"`
	RevokedAt *time.Time `json:"revokedAt"`
}

type createInviteResponse = httptransport.InviteCreateResponse

type publicInviteLink struct {
	ID        string    `json:"id"`
	Role      string    `json:"role"`
	URL       string    `json:"url"`
	ExpiresAt time.Time `json:"expiresAt"`
	MaxUses   int       `json:"maxUses"`
	UsedCount int       `json:"usedCount"`
}

type quickStartPublicAccessResponse struct {
	Status       string               `json:"status"`
	Provider     string               `json:"provider"`
	PublicURL    string               `json:"publicUrl"`
	Origin       *string              `json:"origin"`
	Message      *string              `json:"message"`
	PublicAccess publicAccessSettings `json:"publicAccess"`
	InviteLinks  []publicInviteLink   `json:"inviteLinks"`
}

type publicIPQuickStartResponse struct {
	Status                 string                `json:"status"`
	PublicIP               string                `json:"publicIp"`
	PublicURL              string                `json:"publicUrl"`
	PublicAccess           *publicAccessSettings `json:"publicAccess"`
	InviteLinks            []publicInviteLink    `json:"inviteLinks"`
	Problems               []string              `json:"problems"`
	RecommendedActions     []string              `json:"recommendedActions"`
	CanUseCloudflareTunnel bool                  `json:"canUseCloudflareTunnel"`
}

type invitePreviewResponse struct {
	FamilyName    string    `json:"familyName"`
	Role          string    `json:"role"`
	ExpiresAt     time.Time `json:"expiresAt"`
	UsesRemaining int       `json:"usesRemaining"`
}

type authResponse struct {
	AccessToken      string     `json:"accessToken"`
	TokenType        string     `json:"tokenType"`
	ExpiresInSeconds int64      `json:"expiresInSeconds"`
	User             userPublic `json:"user"`
	RefreshToken     string     `json:"refreshToken,omitempty"` // Also in body for cross-origin clients (e.g. Capacitor on Android)
}

type setupStatusResponse struct {
	SetupRequired bool           `json:"setupRequired"`
	SetupComplete bool           `json:"setupComplete"`
	FamilyName    *string        `json:"familyName,omitempty"`
	NavTabs       *NavTabsConfig `json:"navTabs,omitempty"`
}

type setupRequest struct {
	FamilyName  string `json:"familyName"`
	Nickname    string `json:"nickname"`
	Username    string `json:"username"`
	Password    string `json:"password"`
	DisplayName string `json:"displayName"`
	InviteToken string `json:"inviteToken"`
}

type loginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type deviceLoginRequest struct {
	Username string `json:"username"`
}

type deviceLoginVerifyRequest struct {
	Username string `json:"username"`
	Code     string `json:"code"`
}

type changePasswordRequest struct {
	CurrentPassword string `json:"currentPassword"`
	NewPassword     string `json:"newPassword"`
}

type updateMeRequest struct {
	DisplayName             *string   `json:"displayName"`
	PublicKey               *string   `json:"publicKey"`
	ProfilePhotoFileID      *string   `json:"profilePhotoFileId"`
	ProfileVisibility       *string   `json:"profileVisibility"`
	LastSeenVisibility      *string   `json:"lastSeenVisibility"`
	ReadReceiptsEnabled     *bool     `json:"readReceiptsEnabled"`
	DirectMessagePermission *string   `json:"directMessagePermission"`
	GroupInvitePermission   *string   `json:"groupInvitePermission"`
	ChannelInvitePermission *string   `json:"channelInvitePermission"`
	VoiceInvitePermission   *string   `json:"voiceInvitePermission"`
	InvitePermissionUserIDs *[]string `json:"invitePermissionUserIds"`
	Email                   *string   `json:"email"`
	Bio                     *string   `json:"bio"`
	Timezone                *string   `json:"timezone"`
}

type updateFamilyRequest struct {
	Name                        *string `json:"name"`
	StorageLimitMB              *int64  `json:"storageLimitMb"`
	MinimizedChatLayout         *bool   `json:"minimizedChatLayout"`
	DefaultProfileVisibility    *string `json:"defaultProfileVisibility"`
	DefaultLastSeenVisibility   *string `json:"defaultLastSeenVisibility"`
	DefaultReadReceiptsEnabled  *bool   `json:"defaultReadReceiptsEnabled"`
	DefaultNotificationSettings *string `json:"defaultNotificationSettings"`
}

type serverRolePublic struct {
	ID          string   `json:"id"`
	Name        string   `json:"name"`
	Description string   `json:"description,omitempty"`
	Permissions []string `json:"permissions"`
	IsDefault   bool     `json:"isDefault"`
	MemberCount int      `json:"memberCount"`
}

type createServerRoleRequest struct {
	Name        string   `json:"name"`
	Description string   `json:"description"`
	Permissions []string `json:"permissions"`
}

type updateServerRoleRequest struct {
	Name        *string   `json:"name"`
	Description *string   `json:"description"`
	Permissions *[]string `json:"permissions"`
}

type planPublic struct {
	ID           string               `json:"id"`
	FamilyID     string               `json:"familyId"`
	Title        string               `json:"title"`
	Notes        *string              `json:"notes"`
	Location     *string              `json:"location"`
	StartsAt     time.Time            `json:"startsAt"`
	EndsAt       time.Time            `json:"endsAt"`
	AllDay       bool                 `json:"allDay"`
	TimeZone     string               `json:"timeZone"`
	Recurrence   *string              `json:"recurrence"`
	CreatedBy    string               `json:"createdBy"`
	SourceChatID *string              `json:"sourceChatId"`
	Revision     int                  `json:"revision"`
	CreatedAt    time.Time            `json:"createdAt"`
	UpdatedAt    time.Time            `json:"updatedAt"`
	Attendees    []planAttendeePublic `json:"attendees"`
}

type planAttendeePublic struct {
	UserID string `json:"userId"`
	Status string `json:"status"`
}

type createPlanRequest struct {
	Title        string    `json:"title"`
	Notes        *string   `json:"notes"`
	Location     *string   `json:"location"`
	StartsAt     time.Time `json:"startsAt"`
	EndsAt       time.Time `json:"endsAt"`
	AllDay       bool      `json:"allDay"`
	TimeZone     string    `json:"timeZone"`
	Recurrence   *string   `json:"recurrence"`
	AttendeeIDs  []string  `json:"attendeeIds"`
	SourceChatID *string   `json:"sourceChatId"`
}

type updatePlanRequest struct {
	Title       *string    `json:"title"`
	Notes       *string    `json:"notes"`
	Location    *string    `json:"location"`
	StartsAt    *time.Time `json:"startsAt"`
	EndsAt      *time.Time `json:"endsAt"`
	AllDay      *bool      `json:"allDay"`
	TimeZone    *string    `json:"timeZone"`
	Recurrence  *string    `json:"recurrence"`
	AttendeeIDs *[]string  `json:"attendeeIds"`
	Revision    int        `json:"revision"`
}

type planRSVPRequest struct {
	Status string `json:"status"`
}

type changeRoleRequest struct {
	Role string `json:"role"`
}

type createInviteRequest = httptransport.InviteCreateRequest

type acceptInviteRequest = httptransport.InviteAcceptRequest

// Chat transport DTOs live at the HTTP edge. Aliases retain the existing
// compatibility names while app finishes delegating the surrounding handlers.
type chatMemberPublic = chatpresenter.Member
type chatPublic = chatpresenter.Chat

type pinnedMessagePublic struct {
	ChatID    string        `json:"chatId"`
	MessageID string        `json:"messageId"`
	PinnedBy  string        `json:"pinnedBy"`
	PinnedAt  time.Time     `json:"pinnedAt"`
	Message   messagePublic `json:"message"`
}

type updateChatPreferencesRequest struct {
	IsMuted         *bool   `json:"isMuted"`
	IsPinned        *bool   `json:"isPinned"`
	IsFavorite      *bool   `json:"isFavorite"`
	WallpaperFileID *string `json:"wallpaperFileId"`
}

type filePublic struct {
	ID                 string     `json:"id"`
	FamilyID           string     `json:"familyId"`
	UploadedBy         string     `json:"uploadedBy"`
	ChatID             *string    `json:"chatId"`
	ChatTitle          *string    `json:"chatTitle"`
	ChatType           *string    `json:"chatType"`
	OriginMessageID    *string    `json:"originMessageId"`
	AccessScope        string     `json:"accessScope"`
	StorageProvider    string     `json:"storageProvider"`
	ThumbnailObjectKey *string    `json:"thumbnailObjectKey"`
	OriginalName       string     `json:"originalName"`
	MimeType           string     `json:"mimeType"`
	SizeBytes          int64      `json:"sizeBytes"`
	Checksum           *string    `json:"checksum"`
	CreatedAt          time.Time  `json:"createdAt"`
	DeletedAt          *time.Time `json:"deletedAt"`
	IsFavorite         bool       `json:"isFavorite"`
}

type updateFilePreferencesRequest struct {
	IsFavorite *bool `json:"isFavorite"`
}

type messageStatusPublic struct {
	UserID    string    `json:"userId"`
	Status    string    `json:"status"`
	CreatedAt time.Time `json:"createdAt"`
}

type messageForwardPublic struct {
	MessageID         string  `json:"messageId"`
	ChatID            string  `json:"chatId"`
	SenderID          string  `json:"senderId"`
	SenderDisplayName *string `json:"senderDisplayName"`
}

type messageReactionPublic struct {
	Emoji   string   `json:"emoji"`
	Count   int      `json:"count"`
	UserIDs []string `json:"userIds"`
	Reacted bool     `json:"reacted"`
}

type callHistoryPublic struct {
	Status          string   `json:"status"`
	CallType        string   `json:"callType"`
	CallerID        string   `json:"callerId"`
	CalleeID        string   `json:"calleeId"`
	DurationSeconds *int     `json:"durationSeconds,omitempty"`
	ParticipantIDs  []string `json:"participantIds,omitempty"`
	Topology        string   `json:"topology,omitempty"`
	RoomID          string   `json:"roomId,omitempty"`
}

type messagePublic struct {
	ID                  string                  `json:"id"`
	ChatID              string                  `json:"chatId"`
	SenderID            string                  `json:"senderId"`
	SenderDisplayName   *string                 `json:"senderDisplayName"`
	Type                string                  `json:"type"`
	Content             *string                 `json:"content"`
	EncryptionProtocol  string                  `json:"encryptionProtocol"`
	Ciphertext          *string                 `json:"ciphertext"`
	Nonce               *string                 `json:"nonce"`
	KeyVersion          *int                    `json:"keyVersion"`
	EncryptionMetadata  *string                 `json:"encryptionMetadata"`
	ReplyToMessageID    *string                 `json:"replyToMessageId"`
	ThreadRootMessageID *string                 `json:"threadRootMessageId"`
	MessageKind         string                  `json:"messageKind"`
	CommentCount        int                     `json:"commentCount"`
	CreatedAt           time.Time               `json:"createdAt"`
	UpdatedAt           time.Time               `json:"updatedAt"`
	DeletedAt           *time.Time              `json:"deletedAt"`
	IsEdited            bool                    `json:"isEdited"`
	ForwardedFrom       *messageForwardPublic   `json:"forwardedFrom,omitempty"`
	Statuses            []messageStatusPublic   `json:"statuses"`
	Reactions           []messageReactionPublic `json:"reactions"`
	Attachments         []filePublic            `json:"attachments"`
	ClientMessageID     *string                 `json:"clientMessageId,omitempty"`
	Call                *callHistoryPublic      `json:"call,omitempty"`
}

type sendMessageRequest struct {
	Type                string   `json:"type"`
	Content             *string  `json:"content"`
	FileIDs             []string `json:"fileIds"`
	ReplyToMessageID    *string  `json:"replyToMessageId"`
	ThreadRootMessageID *string  `json:"threadRootMessageId"`
	EncryptionProtocol  *string  `json:"encryptionProtocol"`
	Ciphertext          *string  `json:"ciphertext"`
	Nonce               *string  `json:"nonce"`
	KeyVersion          *int     `json:"keyVersion"`
	EncryptionMetadata  *string  `json:"encryptionMetadata"`
	MentionedUserIDs    []string `json:"mentionedUserIds"`
	AttachmentsPending  bool     `json:"attachmentsPending"`
}

type attachMessageFilesRequest struct {
	FileIDs []string `json:"fileIds"`
}

type forwardMessageRequest struct {
	ChatID string `json:"chatId"`
}

type messageReactionRequest struct {
	Emoji string `json:"emoji"`
}

type editMessageRequest struct {
	Content string `json:"content"`
}

type logsResponse struct {
	Records    []logRecord `json:"records"`
	Total      int         `json:"total"`
	BufferSize int         `json:"bufferSize"`
	Limit      int         `json:"limit"`
}

type publicAccessSettings struct {
	AppURL                  string  `json:"appUrl"`
	APIURL                  string  `json:"apiUrl"`
	ConfiguredAppURL        *string `json:"configuredAppUrl"`
	ConfiguredAPIURL        *string `json:"configuredApiUrl"`
	EnvironmentAppURL       string  `json:"environmentAppUrl"`
	EnvironmentAPIURL       string  `json:"environmentApiUrl"`
	InviteURLIncludesAPIURL bool    `json:"inviteUrlIncludesApiUrl"`
}

type publicAccessCandidate struct {
	Label  string `json:"label"`
	AppURL string `json:"appUrl"`
	APIURL string `json:"apiUrl"`
}

type publicAccessSuggestions struct {
	Candidates []publicAccessCandidate `json:"candidates"`
}

type publicAccessCheckTarget struct {
	Name       string `json:"name"`
	URL        string `json:"url"`
	OK         bool   `json:"ok"`
	StatusCode *int   `json:"statusCode"`
	Detail     string `json:"detail"`
}

type publicAccessCheckResponse struct {
	AllOK   bool                      `json:"allOk"`
	Targets []publicAccessCheckTarget `json:"targets"`
}

type publicAccessUpdateRequest struct {
	AppURL *string `json:"appUrl"`
	APIURL *string `json:"apiUrl"`
}

type publicTunnelStatus struct {
	State                  string                `json:"state"`
	Provider               *string               `json:"provider"`
	URL                    *string               `json:"url"`
	Origin                 *string               `json:"origin"`
	Message                *string               `json:"message"`
	Logs                   []string              `json:"logs"`
	AutoRestart            bool                  `json:"autoRestart"`
	Restarts               int                   `json:"restarts"`
	LastRestartReason      *string               `json:"lastRestartReason"`
	HealthStatus           string                `json:"healthStatus"`
	LastHealthCheckAt      *time.Time            `json:"lastHealthCheckAt"`
	LastHealthError        *string               `json:"lastHealthError"`
	HealthFailureStreak    int                   `json:"healthFailureStreak"`
	HealthFailureThreshold int                   `json:"healthFailureThreshold"`
	PublicAccess           *publicAccessSettings `json:"publicAccess"`
}

type domainLinkRequest struct {
	Domain    string  `json:"domain"`
	APIDomain *string `json:"apiDomain"`
}

type domainDNSRecord struct {
	Type    string `json:"type"`
	Name    string `json:"name"`
	Value   string `json:"value"`
	Proxied bool   `json:"proxied"`
}

type domainLinkResponse struct {
	PublicIP     string                `json:"publicIp"`
	AppURL       string                `json:"appUrl"`
	APIURL       string                `json:"apiUrl"`
	Records      []domainDNSRecord     `json:"records"`
	PublicAccess *publicAccessSettings `json:"publicAccess"`
}

type encryptionProtocolPublic struct {
	Value       string `json:"value"`
	Label       string `json:"label"`
	Description string `json:"description"`
}

type encryptionSettingsResponse struct {
	DefaultMessageEncryptionProtocol string                     `json:"defaultMessageEncryptionProtocol"`
	SupportedProtocols               []encryptionProtocolPublic `json:"supportedProtocols"`
	CompatibilityNotes               []string                   `json:"compatibilityNotes"`
}

type encryptionSettingsUpdateRequest struct {
	DefaultMessageEncryptionProtocol string `json:"defaultMessageEncryptionProtocol"`
}

type socketSendMessageRequest = realtimetransport.MessageSendRequest
type socketReadRequest = realtimetransport.MessageReadRequest
type socketTypingRequest = realtimetransport.TypingRequest

// Deprecated local names retain compatibility for the coordinator while the
// wire shapes are owned by the realtime transport.
type socketCallStartRequest = realtimetransport.CallStartRequest
type socketCallActionRequest = realtimetransport.CallActionRequest
type socketCallInviteRequest = realtimetransport.CallInviteRequest
type socketCallSignalRequest = realtimetransport.CallSignalRequest

type logRecord struct {
	ID           int64     `json:"id"`
	Timestamp    time.Time `json:"timestamp"`
	Level        string    `json:"level"`
	LevelNo      int       `json:"levelNo"`
	Logger       string    `json:"logger"`
	Message      string    `json:"message"`
	Module       string    `json:"module"`
	FunctionName string    `json:"functionName"`
	LineNo       int       `json:"lineNo"`
	Exception    *string   `json:"exception"`
}

type iceServerResponse struct {
	ICEServers []iceServer `json:"iceServers"`
}

type iceServer struct {
	URLs       []string `json:"urls"`
	Username   string   `json:"username,omitempty"`
	Credential string   `json:"credential,omitempty"`
}

type audioCallSettings struct {
	SpeakerMode               string                  `json:"speakerMode"`
	InputDeviceID             string                  `json:"inputDeviceId"`
	OutputDeviceID            string                  `json:"outputDeviceId"`
	EchoCancellation          bool                    `json:"echoCancellation"`
	NoiseSuppression          bool                    `json:"noiseSuppression"`
	AutoGainControl           bool                    `json:"autoGainControl"`
	VoiceEnhancement          bool                    `json:"voiceEnhancement"`
	InputGain                 float64                 `json:"inputGain"`
	OutputVolume              float64                 `json:"outputVolume"`
	VoiceEnhancementThreshold float64                 `json:"voiceEnhancementThreshold"`
	VoiceEnhancementHighpass  float64                 `json:"voiceEnhancementHighpass"`
	Privacy                   *contactPrivacySettings `json:"privacy,omitempty"`
}

type contactPrivacySettings struct {
	DirectMessagePermission string   `json:"directMessagePermission"`
	GroupInvitePermission   string   `json:"groupInvitePermission"`
	ChannelInvitePermission string   `json:"channelInvitePermission"`
	VoiceInvitePermission   string   `json:"voiceInvitePermission"`
	InvitePermissionUserIDs []string `json:"invitePermissionUserIds"`
}

type updateAudioSettingsRequest = audioCallSettings
