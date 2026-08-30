package outbox

import (
	"context"
	"testing"

	"github.com/alicebob/miniredis/v2"
	"github.com/redis/go-redis/v9"
	workruntime "stovo-messenger/backend/internal/runtime"
)

func TestRedisPublisherPublishesContractFields(t *testing.T) {
	server := miniredis.RunT(t)
	client := redis.NewClient(&redis.Options{Addr: server.Addr()})
	t.Cleanup(func() { _ = client.Close() })

	publisher := NewRedisPublisher(client, "jobs")
	if err := publisher.PublishJob(context.Background(), workruntime.OutboxEvent{
		ID: "event-1", Topic: "file.validate", SchemaVersion: 2, PartitionKey: "family-1", Payload: []byte(`{"uploadId":"upload-1"}`),
	}); err != nil {
		t.Fatalf("publish job: %v", err)
	}

	entries, err := client.XRange(context.Background(), "jobs", "-", "+").Result()
	if err != nil {
		t.Fatalf("read jobs: %v", err)
	}
	if len(entries) != 1 {
		t.Fatalf("entries=%d", len(entries))
	}
	values := entries[0].Values
	if values["event_id"] != "event-1" || values["topic"] != "file.validate" || values["partition_key"] != "family-1" || values["payload"] != `{"uploadId":"upload-1"}` {
		t.Fatalf("unexpected values: %#v", values)
	}
	if got, ok := values["schema_version"].(string); !ok || got != "2" {
		t.Fatalf("schema_version=%#v", values["schema_version"])
	}
}
