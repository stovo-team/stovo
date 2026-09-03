package plugins

import (
	"context"
	"sync"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
)

type mockPlugin struct {
	id     string
	name   string
	called bool
}

type configurableMockPlugin struct {
	mockPlugin
	enabled bool
}

func (m *configurableMockPlugin) Enabled() bool { return m.enabled }
func (m *configurableMockPlugin) SetEnabled(_ context.Context, enabled bool) error {
	m.enabled = enabled
	return nil
}

func (m *mockPlugin) ID() string   { return m.id }
func (m *mockPlugin) Name() string { return m.name }
func (m *mockPlugin) Init(s Services) error {
	m.called = true
	return nil
}
func (m *mockPlugin) RegisterRoutes(r chi.Router) {}
func (m *mockPlugin) SubscribeEvents(bus EventBus) {
	bus.Subscribe(EventMessageSent, func(ctx context.Context, e Event) error {
		return nil
	})
}

func TestPluginRegistry(t *testing.T) {
	reg := NewPluginRegistry()
	p := &mockPlugin{id: "test-plugin", name: "Test Plugin"}

	reg.Register(p)

	got, ok := reg.Get("test-plugin")
	if !ok {
		t.Fatalf("expected to find test-plugin in registry")
	}
	if got.Name() != "Test Plugin" {
		t.Errorf("got plugin name %s; want Test Plugin", got.Name())
	}

	list := reg.List()
	if len(list) != 1 {
		t.Errorf("expected 1 registered plugin, got %d", len(list))
	}
}

func TestPluginRegistryUpdatesConfigurablePluginStatus(t *testing.T) {
	reg := NewPluginRegistry()
	p := &configurableMockPlugin{mockPlugin: mockPlugin{id: "toggleable", name: "Toggleable"}, enabled: true}
	reg.Register(p)

	status, err := reg.SetEnabled(context.Background(), "toggleable", false)
	if err != nil {
		t.Fatalf("SetEnabled() error = %v", err)
	}
	if status.Enabled || p.Enabled() {
		t.Fatal("expected plugin to be disabled")
	}
	if statuses := reg.Statuses(); len(statuses) != 1 || statuses[0].Enabled {
		t.Fatalf("Statuses() = %#v, want one disabled plugin", statuses)
	}
}

func TestMemoryEventBus(t *testing.T) {
	bus := NewMemoryEventBus()
	var wg sync.WaitGroup
	wg.Add(1)

	var received Event
	bus.Subscribe(EventUserJoined, func(ctx context.Context, event Event) error {
		received = event
		wg.Done()
		return nil
	})

	testEvent := Event{
		Type:      EventUserJoined,
		Timestamp: time.Now(),
		Payload:   map[string]interface{}{"user_id": "u-123"},
	}

	bus.Publish(context.Background(), testEvent)

	done := make(chan struct{})
	go func() {
		wg.Wait()
		close(done)
	}()

	select {
	case <-done:
		if received.Payload["user_id"] != "u-123" {
			t.Errorf("expected payload user_id u-123, got %v", received.Payload["user_id"])
		}
	case <-time.After(1 * time.Second):
		t.Fatalf("event bus timed out waiting for subscriber execution")
	}
}
