package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

type LoadClient struct {
	ID          string
	TargetURL   string
	Username    string
	AccessToken string
	UserID      string

	wsConn  *websocket.Conn
	wsLock  sync.Mutex
	closed  atomic.Bool
	ackID   atomic.Int64
	ackWait sync.Map // ackID -> chan any

	OnMessageReceived func(msgID, clientMsgID string, sendTime time.Time)
	OnPongReceived    func(rtt time.Duration)

	httpClient *http.Client
}

func NewLoadClient(id, targetURL, username string) *LoadClient {
	return &LoadClient{
		ID:        id,
		TargetURL: strings.TrimRight(targetURL, "/"),
		Username:  username,
		httpClient: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

func (c *LoadClient) Login(ctx context.Context, password string) error {
	loginPayload := map[string]string{
		"login":    c.Username,
		"password": password,
	}
	bodyBytes, _ := json.Marshal(loginPayload)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.TargetURL+"/api/auth/login", bytes.NewReader(bodyBytes))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("login failed status %d: %s", resp.StatusCode, string(respBody))
	}

	var res struct {
		AccessToken string `json:"accessToken"`
		User        struct {
			ID string `json:"id"`
		} `json:"user"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&res); err != nil {
		return err
	}
	c.AccessToken = res.AccessToken
	c.UserID = res.User.ID
	return nil
}

func (c *LoadClient) ConnectSocket(ctx context.Context) error {
	baseURL := c.TargetURL
	wsScheme := "ws"
	if strings.HasPrefix(baseURL, "https://") {
		wsScheme = "wss"
		baseURL = strings.TrimPrefix(baseURL, "https://")
	} else {
		baseURL = strings.TrimPrefix(baseURL, "http://")
	}

	wsURL := fmt.Sprintf("%s://%s/socket.io/?EIO=4&transport=websocket&token=%s",
		wsScheme, baseURL, url.QueryEscape(c.AccessToken))

	dialer := websocket.Dialer{
		HandshakeTimeout: 10 * time.Second,
	}

	conn, _, err := dialer.DialContext(ctx, wsURL, nil)
	if err != nil {
		return fmt.Errorf("websocket dial: %w", err)
	}
	c.wsConn = conn

	// Step 1: Read Engine.IO Open packet "0{...}"
	_, message, err := conn.ReadMessage()
	if err != nil {
		conn.Close()
		return fmt.Errorf("engine.io handshake read: %w", err)
	}
	if len(message) == 0 || message[0] != '0' {
		conn.Close()
		return fmt.Errorf("invalid engine.io open packet: %s", string(message))
	}

	// Step 2: Send Socket.IO CONNECT packet "40"
	if err := conn.WriteMessage(websocket.TextMessage, []byte("40")); err != nil {
		conn.Close()
		return fmt.Errorf("socket.io connect write: %w", err)
	}

	// Step 3: Wait for Socket.IO CONNECT ACK "40{...}"
	_, message, err = conn.ReadMessage()
	if err != nil {
		conn.Close()
		return fmt.Errorf("socket.io connect ack read: %w", err)
	}
	if len(message) < 2 || !strings.HasPrefix(string(message), "40") {
		conn.Close()
		return fmt.Errorf("unexpected socket.io ack: %s", string(message))
	}

	// Start background read pump
	go c.readPump()
	return nil
}

func (c *LoadClient) readPump() {
	defer func() {
		c.closed.Store(true)
		if c.wsConn != nil {
			_ = c.wsConn.Close()
		}
	}()

	for {
		_, raw, err := c.wsConn.ReadMessage()
		if err != nil {
			return
		}

		msg := string(raw)
		if len(msg) == 0 {
			continue
		}

		switch msg[0] {
		case '2': // Engine.IO Ping -> send Pong "3"
			c.writeRaw("3")
		case '3': // Engine.IO Pong
		case '4': // Socket.IO packet
			if len(msg) < 2 {
				continue
			}
			switch msg[1] {
			case '2': // Event packet "42[...]"
				c.handleSocketEvent(msg[2:])
			case '3': // Ack packet "43<ack_id>[...]"
				c.handleSocketAck(msg[2:])
			}
		}
	}
}

func (c *LoadClient) handleSocketEvent(payload string) {
	var arr []json.RawMessage
	if err := json.Unmarshal([]byte(payload), &arr); err != nil || len(arr) == 0 {
		return
	}

	var eventName string
	if err := json.Unmarshal(arr[0], &eventName); err != nil {
		return
	}

	switch eventName {
	case "health:pong":
		if len(arr) > 1 && c.OnPongReceived != nil {
			var body struct {
				Echo struct {
					Timestamp int64 `json:"t"`
				} `json:"echo"`
			}
			if err := json.Unmarshal(arr[1], &body); err == nil && body.Echo.Timestamp > 0 {
				rtt := time.Since(time.Unix(0, body.Echo.Timestamp))
				c.OnPongReceived(rtt)
			}
		}

	case "message:new":
		if len(arr) > 1 && c.OnMessageReceived != nil {
			var msg struct {
				ID              string `json:"id"`
				ClientMessageID string `json:"clientMessageId"`
				CreatedAt       string `json:"createdAt"`
			}
			if err := json.Unmarshal(arr[1], &msg); err == nil {
				parsedTime, _ := time.Parse(time.RFC3339, msg.CreatedAt)
				c.OnMessageReceived(msg.ID, msg.ClientMessageID, parsedTime)
			}
		}
	}
}

func (c *LoadClient) handleSocketAck(raw string) {
	// Format: <ack_id>[data...]
	idx := strings.Index(raw, "[")
	if idx == -1 {
		idx = strings.Index(raw, "{")
	}
	if idx == -1 {
		return
	}

	ackIDStr := raw[:idx]
	ackID, err := strconv.ParseInt(ackIDStr, 10, 64)
	if err != nil {
		return
	}

	if ch, ok := c.ackWait.LoadAndDelete(ackID); ok {
		waitChan := ch.(chan []byte)
		waitChan <- []byte(raw[idx:])
	}
}

func (c *LoadClient) SendPing() error {
	payload := fmt.Sprintf(`42["health:ping",{"t":%d}]`, time.Now().UnixNano())
	return c.writeRaw(payload)
}

func (c *LoadClient) SendMessage(ctx context.Context, chatID, content string) (time.Duration, error) {
	clientMsgID := uuid.NewString()
	ackID := c.ackID.Add(1)
	start := time.Now()

	waitChan := make(chan []byte, 1)
	c.ackWait.Store(ackID, waitChan)
	defer c.ackWait.Delete(ackID)

	msgPacket := fmt.Sprintf(`42%d["message:send",{"chatId":"%s","content":"%s","clientMessageId":"%s"}]`,
		ackID, chatID, content, clientMsgID)

	if err := c.writeRaw(msgPacket); err != nil {
		return 0, err
	}

	select {
	case <-waitChan:
		rtt := time.Since(start)
		return rtt, nil
	case <-ctx.Done():
		return 0, ctx.Err()
	case <-time.After(5 * time.Second):
		return 0, errors.New("timeout waiting for message:send ack")
	}
}

func (c *LoadClient) writeRaw(packet string) error {
	if c.closed.Load() || c.wsConn == nil {
		return errors.New("connection closed")
	}
	c.wsLock.Lock()
	defer c.wsLock.Unlock()
	return c.wsConn.WriteMessage(websocket.TextMessage, []byte(packet))
}

func (c *LoadClient) Close() {
	if c.closed.CompareAndSwap(false, true) {
		if c.wsConn != nil {
			_ = c.wsConn.Close()
		}
	}
}
