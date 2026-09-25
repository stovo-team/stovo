package fcm

import (
	"context"
	"fmt"
	"strconv"
	"strings"

	firebase "firebase.google.com/go/v4"
	"firebase.google.com/go/v4/messaging"
	"google.golang.org/api/option"
)

// Client wraps the Firebase Cloud Messaging client.
type Client struct {
	messaging *messaging.Client
}

// NewClient initializes a new FCM Client. If neither credentialsFile nor credentialsJSON
// is supplied, an unconfigured client is returned that gracefully skips push delivery.
func NewClient(ctx context.Context, credentialsFile, credentialsJSON string) (*Client, error) {
	credentialsFile = strings.TrimSpace(credentialsFile)
	credentialsJSON = strings.TrimSpace(credentialsJSON)

	if credentialsFile == "" && credentialsJSON == "" {
		return &Client{messaging: nil}, nil
	}

	var opts []option.ClientOption
	if credentialsFile != "" {
		opts = append(opts, option.WithAuthCredentialsFile(option.ServiceAccount, credentialsFile))
	} else if credentialsJSON != "" {
		opts = append(opts, option.WithAuthCredentialsJSON(option.ServiceAccount, []byte(credentialsJSON)))
	}

	app, err := firebase.NewApp(ctx, nil, opts...)
	if err != nil {
		return nil, fmt.Errorf("firebase new app: %w", err)
	}

	msgClient, err := app.Messaging(ctx)
	if err != nil {
		return nil, fmt.Errorf("firebase messaging: %w", err)
	}

	return &Client{messaging: msgClient}, nil
}

// IsConfigured returns true if the FCM client is ready to dispatch notifications.
func (c *Client) IsConfigured() bool {
	return c != nil && c.messaging != nil
}

// SendChatMessage delivers a chat message data payload to the specified device token.
func (c *Client) SendChatMessage(
	ctx context.Context,
	token string,
	chatID string,
	chatType string,
	title string,
	message string,
	priority int,
	tags []string,
) error {
	if !c.IsConfigured() {
		return nil
	}
	if strings.TrimSpace(token) == "" {
		return nil
	}

	fcmPriority := "high"
	if priority < 3 {
		fcmPriority = "normal"
	}

	clickURL := "stovo://chat/" + chatID
	tagList := strings.Join(tags, ",")

	msg := registrationTokenMessage(token, map[string]string{
		"event":     "message",
		"chat_id":   chatID,
		"chat_type": chatType,
		"title":     title,
		"message":   message,
		"click":     clickURL,
		"tags":      tagList,
		"priority":  strconv.Itoa(priority),
	}, fcmPriority)

	_, err := c.messaging.Send(ctx, msg)
	if err != nil {
		return fmt.Errorf("fcm send chat message: %w", err)
	}
	return nil
}

// SendCallRinging delivers an incoming call notification payload to the specified device token.
func (c *Client) SendCallRinging(
	ctx context.Context,
	token string,
	chatID string,
	callerName string,
) error {
	if !c.IsConfigured() {
		return nil
	}
	if strings.TrimSpace(token) == "" {
		return nil
	}

	clickURL := "stovo://call/" + chatID

	msg := registrationTokenMessage(token, map[string]string{
		"event":    "message",
		"chat_id":  chatID,
		"title":    callerName,
		"message":  "Incoming call",
		"click":    clickURL,
		"tags":     "phone",
		"priority": "5",
	}, "high")

	_, err := c.messaging.Send(ctx, msg)
	if err != nil {
		return fmt.Errorf("fcm send call ringing: %w", err)
	}
	return nil
}

// SendCallMissed delivers a missed call notification payload to the specified device token.
func (c *Client) SendCallMissed(
	ctx context.Context,
	token string,
	chatID string,
	callerName string,
) error {
	if !c.IsConfigured() {
		return nil
	}
	if strings.TrimSpace(token) == "" {
		return nil
	}

	clickURL := "stovo://call/missed/" + chatID

	msg := registrationTokenMessage(token, map[string]string{
		"event":    "message",
		"chat_id":  chatID,
		"title":    callerName,
		"message":  "Missed call",
		"click":    clickURL,
		"tags":     "telephone_receiver",
		"priority": "3",
	}, "high")

	_, err := c.messaging.Send(ctx, msg)
	if err != nil {
		return fmt.Errorf("fcm send call missed: %w", err)
	}
	return nil
}

func registrationTokenMessage(token string, data map[string]string, priority string) *messaging.Message {
	return &messaging.Message{
		//nolint:staticcheck // FCM registration tokens are distinct from Firebase installation IDs (Fid).
		Token: token,
		Data:  data,
		Android: &messaging.AndroidConfig{
			Priority: priority,
		},
	}
}
