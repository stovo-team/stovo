package outbox

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/redis/go-redis/v9"
	workruntime "stovo-messenger/backend/internal/runtime"
)

func TestRedisConsumerReadsAndAcknowledgesJobs(t *testing.T) {
	server := miniredis.RunT(t)
	client := redis.NewClient(&redis.Options{Addr: server.Addr()})
	t.Cleanup(func() { _ = client.Close() })
	consumer := NewRedisConsumer(client)
	ctx := context.Background()
	if err := consumer.EnsureGroup(ctx, "jobs", "files", "0"); err != nil {
		t.Fatal(err)
	}
	if err := consumer.EnsureGroup(ctx, "jobs", "files", "0"); err != nil {
		t.Fatalf("repeat group creation: %v", err)
	}
	if err := client.XAdd(ctx, &redis.XAddArgs{Stream: "jobs", Values: map[string]any{"event_id": "event", "topic": "file.validate", "payload": `{"uploadId":"upload"}`}}).Err(); err != nil {
		t.Fatal(err)
	}
	jobs, err := consumer.ReadGroup(ctx, "jobs", "files", "worker", ">", 8, time.Millisecond)
	if err != nil || len(jobs) != 1 || jobs[0].EventID != "event" || jobs[0].Topic != "file.validate" || jobs[0].Payload != `{"uploadId":"upload"}` {
		t.Fatalf("jobs=%+v err=%v", jobs, err)
	}
	if err := consumer.Ack(ctx, "jobs", "files", jobs[0].ID); err != nil {
		t.Fatal(err)
	}
	if _, err := consumer.ReadGroup(ctx, "jobs", "files", "worker", ">", 8, time.Millisecond); !errors.Is(err, workruntime.ErrNoJobs) {
		t.Fatalf("err=%v, want ErrNoJobs", err)
	}
}
