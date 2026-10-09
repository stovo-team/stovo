package socketio

import (
	"errors"
	"io"
	"sync"
	"time"

	"github.com/doquangtan/socketio/v4/engineio"
	"github.com/doquangtan/socketio/v4/protocol"
	"github.com/gofiber/websocket/v2"
	gWebsocket "github.com/gorilla/websocket"
)

type Conn struct {
	mu       sync.RWMutex
	fasthttp *websocket.Conn
	http     *gWebsocket.Conn
	polling  *protocol.Polling
}

func (c *Conn) nextWriter(messageType int) (io.WriteCloser, error) {
	if c == nil {
		return nil, errors.New("socket has disconnected")
	}
	c.mu.RLock()
	httpConn := c.http
	fastHTTPConn := c.fasthttp
	polling := c.polling
	c.mu.RUnlock()
	if httpConn != nil {
		return httpConn.NextWriter(messageType)
	}
	if fastHTTPConn != nil {
		return fastHTTPConn.NextWriter(messageType)
	}
	if polling != nil {
		return polling.NextWriter(messageType)
	}
	return nil, errors.New("not found http or fasthttp socket")
}

func (c *Conn) setReadDeadline(t time.Time) error {
	if c == nil {
		return errors.New("socket has disconnected")
	}
	c.mu.RLock()
	httpConn := c.http
	fastHTTPConn := c.fasthttp
	c.mu.RUnlock()
	if httpConn != nil {
		return httpConn.SetReadDeadline(t)
	}
	if fastHTTPConn != nil {
		return fastHTTPConn.SetReadDeadline(t)
	}
	return errors.New("not found http or fasthttp socket")
}

func (c *Conn) close() {
	if c == nil {
		return
	}
	c.mu.RLock()
	httpConn := c.http
	fastHTTPConn := c.fasthttp
	polling := c.polling
	c.mu.RUnlock()
	if httpConn != nil {
		httpConn.Close()
	}
	if fastHTTPConn != nil {
		fastHTTPConn.Close()
	}
	if polling != nil {
		polling.Close()
	}
}

func (c *Conn) setHTTP(conn *gWebsocket.Conn) {
	c.mu.Lock()
	c.http = conn
	c.mu.Unlock()
}

func (c *Conn) setFastHTTP(conn *websocket.Conn) {
	c.mu.Lock()
	c.fasthttp = conn
	c.mu.Unlock()
}

func (c *Conn) pollingConnection() *protocol.Polling {
	if c == nil {
		return nil
	}
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.polling
}

type broadcastOperator struct {
	sockets *connections
}

func (c *broadcastOperator) Emit(event string, agrs ...interface{}) error {
	for _, socket := range c.sockets.all() {
		socket.Emit(event, agrs...)
	}
	return nil
}

type Socket struct {
	sync.RWMutex
	Id               string
	Nps              string
	Conn             *Conn
	Handshake        engineio.Handshake
	rooms            roomNames
	listeners        listeners
	pingTime         time.Duration
	dispose          []func()
	currentNamespace func() *Namespace
	Join             func(room string)
	Leave            func(room string)
	To               func(room string) *Room
}

func (s *Socket) On(event string, fn eventCallback) {
	s.listeners.set(event, fn)
}

func (s *Socket) Emit(event string, agrs ...interface{}) error {
	agrs = append([]interface{}{event}, agrs...)
	return s.writer(protocol.EVENT, agrs)
}

func (s *Socket) Broadcast() *broadcastOperator {
	c := &broadcastOperator{
		sockets: &connections{
			conn: make(map[string]*Socket),
		},
	}
	currentNps := s.currentNamespace()
	if currentNps != nil {
		for _, socket := range currentNps.sockets.all() {
			if socket.Id != s.Id {
				c.sockets.set(socket)
			}
		}
	}
	return c
}

func (s *Socket) ack(ackEvent string, agrs ...interface{}) error {
	agrs = append([]interface{}{ackEvent}, agrs...)
	return s.writer(protocol.ACK, agrs)
}

func (s *Socket) Ping() error {
	s.Lock()
	defer s.Unlock()
	c := s.Conn
	if c == nil {
		return errors.New("socket has disconnected")
	}
	err := s.engineWriteLocked(engineio.PING)
	if err != nil {
		c.close()
		return err
	}
	return nil
}

func (s *Socket) Disconnect() error {
	s.Lock()
	defer s.Unlock()
	c := s.Conn
	if c == nil {
		return errors.New("socket has disconnected")
	}
	_ = s.writerLocked(protocol.DISCONNECT)
	return c.setReadDeadline(time.Now())
}

func (s *Socket) Rooms() []string {
	return s.rooms.all()
}

func (s *Socket) disconnect() {
	s.Lock()
	conn := s.Conn
	s.Conn = nil
	s.Unlock()
	if conn != nil {
		conn.close()
	}
	// s.rooms = []string{}
	if len(s.dispose) > 0 {
		for _, dispose := range s.dispose {
			dispose()
		}
	}
}

func (s *Socket) isConnected() bool {
	s.RLock()
	defer s.RUnlock()
	return s.Conn != nil
}

func (s *Socket) connectionSnapshot() *Conn {
	s.RLock()
	defer s.RUnlock()
	return s.Conn
}

func (s *Socket) pollingConnection() *protocol.Polling {
	return s.connectionSnapshot().pollingConnection()
}

func (s *Socket) attachHTTP(conn *gWebsocket.Conn) bool {
	s.Lock()
	defer s.Unlock()
	if s.Conn == nil {
		return false
	}
	s.Conn.setHTTP(conn)
	return true
}

func (s *Socket) attachFastHTTP(conn *websocket.Conn) bool {
	s.Lock()
	defer s.Unlock()
	if s.Conn == nil {
		return false
	}
	s.Conn.setFastHTTP(conn)
	return true
}

func (s *Socket) engineWrite(t engineio.PacketType, arg ...interface{}) error {
	s.Lock()
	defer s.Unlock()
	return s.engineWriteLocked(t, arg...)
}

func (s *Socket) engineWriteLocked(t engineio.PacketType, arg ...interface{}) error {
	conn := s.Conn
	if conn == nil {
		return errors.New("socket has disconnected")
	}
	w, err := conn.nextWriter(websocket.TextMessage)
	if err != nil {
		return err
	}
	engineio.WriteTo(w, t, arg...)
	return w.Close()
}

func (s *Socket) writer(t protocol.PacketType, arg ...interface{}) error {
	s.Lock()
	defer s.Unlock()
	return s.writerLocked(t, arg...)
}

func (s *Socket) writerLocked(t protocol.PacketType, arg ...interface{}) error {
	conn := s.Conn
	if conn == nil {
		return errors.New("socket has disconnected")
	}
	w, err := conn.nextWriter(websocket.TextMessage)
	if err != nil {
		return err
	}
	nps := ""
	if s.Nps != "/" {
		nps = s.Nps + ","
	}
	if t == protocol.ACK {
		agrs := append([]interface{}{}, arg[0].([]interface{})[1:])
		protocol.WriteToWithAck(w, t, nps, arg[0].([]interface{})[0].(string), agrs...)
	} else {
		protocol.WriteTo(w, t, nps, arg...)
	}
	return w.Close()
}
