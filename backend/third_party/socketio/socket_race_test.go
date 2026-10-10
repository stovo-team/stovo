package socketio

import (
	"sync"
	"testing"

	"github.com/doquangtan/socketio/v4/protocol"
)

func TestWriterReturnsErrorWhenConnectionWasCleared(t *testing.T) {
	socket := &Socket{}
	if err := socket.writer(protocol.EVENT, []interface{}{"event"}); err == nil {
		t.Fatal("writer should report a disconnected socket")
	}
}

func TestWriterAndDisconnectAreSafeWhenConnectionIsAlreadyCleared(t *testing.T) {
	socket := &Socket{}
	start := make(chan struct{})
	panics := make(chan interface{}, 2)
	var workers sync.WaitGroup
	workers.Add(2)

	run := func(operation func()) {
		defer workers.Done()
		defer func() {
			if recovered := recover(); recovered != nil {
				panics <- recovered
			}
		}()
		<-start
		operation()
	}

	go run(func() { _ = socket.writer(protocol.EVENT, []interface{}{"event"}) })
	go run(socket.disconnect)
	close(start)
	workers.Wait()
	close(panics)
	for recovered := range panics {
		t.Errorf("concurrent writer/disconnect panicked: %v", recovered)
	}
}
