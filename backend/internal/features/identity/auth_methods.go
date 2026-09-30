package identity

import (
	"context"
	"time"
)

type AuthMethodCeremony struct {
	FamilyID, UserID, InviteTokenHash string
	SessionData                      []byte
}

type QRLoginRecord struct {
	Status, ApprovedUserID string
	ExpiresAt              time.Time
}

type PasskeyInviteAcceptance struct {
	UserID, FamilyID, Username, PasswordHash, DisplayName, Role string
	InviteID, FamilyChatID, CredentialID, CredentialData       string
	CredentialRecordID, RefreshTokenID, RefreshTokenHash       string
	RefreshExpiresAt, CreatedAt, IPAddress                      string
	ProfileVisibility, LastSeenVisibility                       string
	ReadReceiptsEnabled                                         bool
}

// AuthMethodsStore owns the persistence operations for passkey ceremonies,
// QR approvals, and the atomic passkey invitation acceptance transaction.
type AuthMethodsStore interface {
	ListPasskeyCredentials(context.Context, string, string) ([][]byte, error)
	SavePasskeyCeremony(context.Context, string, string, string, string, string, []byte, time.Time) error
	ConsumePasskeyCeremony(context.Context, string, string) (AuthMethodCeremony, error)
	SavePasskeyCredential(context.Context, string, string, string, string, []byte) error
	PasskeyOwner(context.Context, string) (string, error)
	UpdatePasskeyCredential(context.Context, string, []byte) error
	CleanupExpiredAuthRequests(context.Context) error
	CreateQRLogin(context.Context, string, string, time.Time) error
	QRLogin(context.Context, string) (QRLoginRecord, error)
	ClaimQRLogin(context.Context, string) (string, error)
	TransitionQRLogin(context.Context, string, string, string, string) (bool, error)
	FamilyChatID(context.Context, string) (string, error)
	AcceptPasskeyInvite(context.Context, PasskeyInviteAcceptance) error
}
