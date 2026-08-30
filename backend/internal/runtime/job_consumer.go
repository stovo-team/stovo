package runtime

import (
	"context"
	"errors"
	"time"
)

var ErrNoJobs = errors.New("no jobs available")

type JobMessage struct{ ID, EventID, Topic, Payload string }

// JobConsumer owns streaming broker semantics outside application workers.
type JobConsumer interface {
	EnsureGroup(context.Context, string, string, string) error
	ReadGroup(context.Context, string, string, string, string, int, time.Duration) ([]JobMessage, error)
	Ack(context.Context, string, string, string) error
}
