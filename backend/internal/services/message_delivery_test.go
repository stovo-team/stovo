package services

import (
	"context"
	"errors"
	"testing"

	"stovo-messenger/backend/internal/domain"
)

type messageDeliveryStub struct {
	published domain.MessageCreated
	notified  domain.MessageNotification
	err       error
}

func (s *messageDeliveryStub) PublishMessageCreated(_ context.Context, event domain.MessageCreated) error {
	s.published = event
	return s.err
}

func (s *messageDeliveryStub) NotifyMessageRecipients(_ context.Context, notification domain.MessageNotification) {
	s.notified = notification
}

func TestMessageDeliveryServiceDispatchesPostPersistenceWork(t *testing.T) {
	stub := &messageDeliveryStub{}
	service := NewMessageDeliveryService(stub)
	event := domain.MessageCreated{EventID: "event", ChatID: "chat", MessageID: "message"}
	notification := domain.MessageNotification{ChatID: "chat", SenderID: "sender"}
	if err := service.PublishCreated(context.Background(), event); err != nil {
		t.Fatalf("PublishCreated() error = %v", err)
	}
	service.NotifyRecipients(context.Background(), notification)
	if stub.published.EventID != event.EventID || stub.published.MessageID != event.MessageID || stub.notified.ChatID != notification.ChatID || stub.notified.SenderID != notification.SenderID {
		t.Fatalf("delivery = %#v, %#v", stub.published, stub.notified)
	}
}

func TestMessageDeliveryServiceReturnsPublishError(t *testing.T) {
	want := errors.New("broker unavailable")
	service := NewMessageDeliveryService(&messageDeliveryStub{err: want})
	if err := service.PublishCreated(context.Background(), domain.MessageCreated{}); !errors.Is(err, want) {
		t.Fatalf("PublishCreated() error = %v, want %v", err, want)
	}
}
