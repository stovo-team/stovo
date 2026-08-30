package messages

import (
	"context"
	"errors"
	"testing"

	"stovo-messenger/backend/internal/domain"
)

type deliveryStub struct {
	published domain.MessageCreated
	notified  domain.MessageNotification
	err       error
}

func (s *deliveryStub) PublishMessageCreated(_ context.Context, event domain.MessageCreated) error {
	s.published = event
	return s.err
}

func (s *deliveryStub) NotifyMessageRecipients(_ context.Context, notification domain.MessageNotification) {
	s.notified = notification
}

func TestDeliveryServiceDelegatesPostPersistenceWork(t *testing.T) {
	stub := &deliveryStub{}
	service := NewDeliveryService(stub)
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

func TestDeliveryServiceReturnsPublishFailure(t *testing.T) {
	want := errors.New("broker unavailable")
	service := NewDeliveryService(&deliveryStub{err: want})
	if err := service.PublishCreated(context.Background(), domain.MessageCreated{}); !errors.Is(err, want) {
		t.Fatalf("PublishCreated() error = %v, want %v", err, want)
	}
}
