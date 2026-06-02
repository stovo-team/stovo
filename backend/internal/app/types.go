package app

import "time"

type userPublic struct {
	ID           string      `json:"id"`
	FamilyID     string      `json:"familyId"`
	Email        string      `json:"email"`
	Username     string      `json:"username"`
	DisplayName  string      `json:"displayName"`
	Role         string      `json:"role"`
	IsActive     bool        `json:"isActive"`
	PublicKey    *string     `json:"publicKey"`
	ProfilePhoto *filePublic `json:"profilePhoto"`
	CreatedAt    *time.Time  `json:"createdAt,omitempty"`
	LastSeenAt   *time.Time  `json:"lastSeenAt"`
}

type familyPublic struct {
	ID                               string  `json:"id"`
	Name                             string  `json:"name"`
	StorageLimitMB                   *int64  `json:"storageLimitMb"`
	DefaultMessageEncryptionProtocol string  `json:"defaultMessageEncryptionProtocol"`
	PublicAppURL                     *string `json:"-"`
	PublicAPIURL                     *string `json:"-"`
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

type createInviteResponse struct {
	InviteURL string       `json:"inviteUrl"`
	Invite    invitePublic `json:"invite"`
}

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
}

type setupStatusResponse struct {
	SetupRequired bool `json:"setupRequired"`
	SetupComplete bool `json:"setupComplete"`
}

type setupRequest struct {
	FamilyName  string `json:"familyName"`
	Nickname    string `json:"nickname"`
	Email       string `json:"email"`
	Username    string `json:"username"`
	Password    string `json:"password"`
	DisplayName string `json:"displayName"`
}

type loginRequest struct {
	Login    string `json:"login"`
	Password string `json:"password"`
}

type updateMeRequest struct {
	DisplayName        *string `json:"displayName"`
	PublicKey          *string `json:"publicKey"`
	ProfilePhotoFileID *string `json:"profilePhotoFileId"`
}

type updateFamilyRequest struct {
	Name           *string `json:"name"`
	StorageLimitMB *int64  `json:"storageLimitMb"`
}

type changeRoleRequest struct {
	Role string `json:"role"`
}

type createInviteRequest struct {
	Role           string `json:"role"`
	ExpiresInHours *int   `json:"expiresInHours"`
	MaxUses        *int   `json:"maxUses"`
}

type acceptInviteRequest struct {
	Nickname    string `json:"nickname"`
	Email       string `json:"email"`
	Username    string `json:"username"`
	Password    string `json:"password"`
	DisplayName string `json:"displayName"`
}

type chatMemberPublic struct {
	ID           string      `json:"id"`
	DisplayName  string      `json:"displayName"`
	Username     string      `json:"username"`
	Role         string      `json:"role"`
	PublicKey    *string     `json:"publicKey"`
	ProfilePhoto *filePublic `json:"profilePhoto"`
}

type chatPublic struct {
	ID                              string             `json:"id"`
	FamilyID                        string             `json:"familyId"`
	Type                            string             `json:"type"`
	Title                           *string            `json:"title"`
	CreatedBy                       *string            `json:"createdBy"`
	MediaVisibility                 string             `json:"mediaVisibility"`
	CommentsEnabled                 bool               `json:"commentsEnabled"`
	EncryptionProtocol              string             `json:"encryptionProtocol"`
	MediaVisibilityPendingApproval  bool               `json:"mediaVisibilityPendingApproval"`
	MediaVisibilityApprovalCount    int                `json:"mediaVisibilityApprovalCount"`
	MediaVisibilityApprovalRequired int                `json:"mediaVisibilityApprovalRequired"`
	MyMediaVisibilityApproval       bool               `json:"myMediaVisibilityApproval"`
	ChatPhoto                       *filePublic        `json:"chatPhoto"`
	CreatedAt                       time.Time          `json:"createdAt"`
	UpdatedAt                       time.Time          `json:"updatedAt"`
	Members                         []chatMemberPublic `json:"members"`
	UnreadCount                     int                `json:"unreadCount"`
	LastMessageID                   *string            `json:"lastMessageId"`
	LastMessageSenderID             *string            `json:"lastMessageSenderId"`
	LastMessageSenderDisplayName    *string            `json:"lastMessageSenderDisplayName"`
	LastMessageContent              *string            `json:"lastMessageContent"`
	LastMessageType                 *string            `json:"lastMessageType"`
	LastMessageCreatedAt            *time.Time         `json:"lastMessageCreatedAt"`
	IsMuted                         bool               `json:"isMuted"`
	IsPinned                        bool               `json:"isPinned"`
	IsFavorite                      bool               `json:"isFavorite"`
}

type createDirectChatRequest struct {
	UserID string `json:"userId"`
}

type createGroupChatRequest struct {
	Title     string   `json:"title"`
	MemberIDs []string `json:"memberIds"`
}

type createChannelChatRequest struct {
	Title     string   `json:"title"`
	MemberIDs []string `json:"memberIds"`
}

type updateChatRequest struct {
	Title           *string `json:"title"`
	MediaVisibility *string `json:"mediaVisibility"`
	ChatPhotoFileID *string `json:"chatPhotoFileId"`
	CommentsEnabled *bool   `json:"commentsEnabled"`
}

type updateChatPreferencesRequest struct {
	IsMuted    *bool `json:"isMuted"`
	IsPinned   *bool `json:"isPinned"`
	IsFavorite *bool `json:"isFavorite"`
}

type filePublic struct {
	ID              string     `json:"id"`
	FamilyID        string     `json:"familyId"`
	UploadedBy      string     `json:"uploadedBy"`
	ChatID          *string    `json:"chatId"`
	ChatTitle       *string    `json:"chatTitle"`
	ChatType        *string    `json:"chatType"`
	AccessScope     string     `json:"accessScope"`
	StorageProvider string     `json:"storageProvider"`
	OriginalName    string     `json:"originalName"`
	MimeType        string     `json:"mimeType"`
	SizeBytes       int64      `json:"sizeBytes"`
	Checksum        *string    `json:"checksum"`
	CreatedAt       time.Time  `json:"createdAt"`
	DeletedAt       *time.Time `json:"deletedAt"`
	IsFavorite      bool       `json:"isFavorite"`
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
	CreatedAt           time.Time               `json:"createdAt"`
	UpdatedAt           time.Time               `json:"updatedAt"`
	DeletedAt           *time.Time              `json:"deletedAt"`
	ForwardedFrom       *messageForwardPublic   `json:"forwardedFrom,omitempty"`
	Statuses            []messageStatusPublic   `json:"statuses"`
	Reactions           []messageReactionPublic `json:"reactions"`
	Attachments         []filePublic            `json:"attachments"`
	ClientMessageID     *string                 `json:"clientMessageId,omitempty"`
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
}

type forwardMessageRequest struct {
	ChatID string `json:"chatId"`
}

type messageReactionRequest struct {
	Emoji string `json:"emoji"`
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

type mediaQualityRule struct {
	MediaType      string `json:"mediaType"`
	Extension      string `json:"extension"`
	QualityPercent int    `json:"qualityPercent"`
}

type mediaQualitySettings struct {
	Rules []mediaQualityRule `json:"rules"`
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

type socketSendMessageRequest struct {
	ChatID              string   `json:"chatId"`
	Content             *string  `json:"content"`
	ReplyToMessageID    *string  `json:"replyToMessageId"`
	ThreadRootMessageID *string  `json:"threadRootMessageId"`
	FileIDs             []string `json:"fileIds"`
	ClientMessageID     *string  `json:"clientMessageId"`
	EncryptionProtocol  *string  `json:"encryptionProtocol"`
	Ciphertext          *string  `json:"ciphertext"`
	Nonce               *string  `json:"nonce"`
	KeyVersion          *int     `json:"keyVersion"`
	EncryptionMetadata  *string  `json:"encryptionMetadata"`
}

type socketReadRequest struct {
	MessageID string  `json:"messageId"`
	ChatID    *string `json:"chatId"`
}

type socketTypingRequest struct {
	ChatID string `json:"chatId"`
}

type socketCallStartRequest struct {
	ChatID string `json:"chatId"`
}

type socketCallActionRequest struct {
	ChatID string `json:"chatId"`
}

type socketCallSignalRequest struct {
	ChatID       string         `json:"chatId"`
	TargetUserID *string        `json:"targetUserId"`
	Data         map[string]any `json:"data"`
}

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
