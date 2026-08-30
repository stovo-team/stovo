package runtime

import (
	"errors"
	"testing"
)

type orderedCloser struct {
	name  string
	order *[]string
	err   error
}

func (c orderedCloser) Close() error {
	*c.order = append(*c.order, c.name)
	return c.err
}

func TestShutdownPreservesDrainAndCloseOrder(t *testing.T) {
	var order []string
	databaseErr := errors.New("database close failed")
	err := Shutdown(ShutdownDependencies{
		CancelRealtime: func() { order = append(order, "cancel") },
		WaitRealtime:   func() { order = append(order, "wait") },
		Sockets:        orderedCloser{name: "sockets", order: &order},
		Redis:          orderedCloser{name: "redis", order: &order, err: errors.New("ignored")},
		JobsRedis:      orderedCloser{name: "jobs redis", order: &order},
		LogBuffer:      orderedCloser{name: "log buffer", order: &order},
		Persistence:    orderedCloser{name: "persistence", order: &order},
		Database:       orderedCloser{name: "database", order: &order, err: databaseErr},
	})
	if !errors.Is(err, databaseErr) {
		t.Fatalf("Shutdown error = %v, want database error", err)
	}
	want := []string{"cancel", "wait", "sockets", "redis", "jobs redis", "log buffer", "persistence", "database"}
	if len(order) != len(want) {
		t.Fatalf("close order = %v, want %v", order, want)
	}
	for i := range want {
		if order[i] != want[i] {
			t.Fatalf("close order = %v, want %v", order, want)
		}
	}
}
