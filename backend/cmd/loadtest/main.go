package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"math/rand"
	"net/http"
	"net/http/httptest"
	"os"
	"os/signal"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/gorilla/websocket"
)

func main() {
	var (
		targetURL  = flag.String("url", "http://localhost:8000", "Target server base URL (e.g. http://localhost:8000)")
		mode       = flag.String("mode", "all", "Test mode: soak, chat, api, ping, all")
		numClients = flag.Int("clients", 25, "Number of concurrent virtual clients")
		duration   = flag.Duration("duration", 10*time.Second, "Test duration (e.g. 10s, 30s, 1m)")
		rate       = flag.Int("rate", 10, "Target operations/sec in chat/ping mode")
		username   = flag.String("username", "admin", "Username for virtual clients")
		password   = flag.String("password", "password123", "Password for virtual clients")
		chatID     = flag.String("chat-id", "", "Chat ID to target (if empty, fetches first chat or uses default)")
		outputJSON = flag.String("output-json", "", "Optional path to save JSON metrics report")
		selfTest   = flag.Bool("self-test", false, "Run an internal mock server self-test to verify the load tester itself")
	)
	flag.Parse()

	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()

	if *selfTest {
		fmt.Println("Running internal self-test with simulated server...")
		runSelfTest(ctx, *duration)
		return
	}

	fmt.Printf("\n🚀 Starting Stovo Messenger Load Test\n")
	fmt.Printf("   Target:   %s\n", *targetURL)
	fmt.Printf("   Mode:     %s\n", *mode)
	fmt.Printf("   Clients:  %d\n", *numClients)
	fmt.Printf("   Duration: %v\n\n", *duration)

	runners := []func(context.Context, string, int, time.Duration, int, string, string, string) StatsSummary{}

	switch strings.ToLower(*mode) {
	case "soak":
		runners = append(runners, runSoakTest)
	case "ping":
		runners = append(runners, runPingTest)
	case "api":
		runners = append(runners, runAPITest)
	case "chat":
		runners = append(runners, runChatTest)
	case "all":
		runners = append(runners, runAPITest, runSoakTest, runPingTest, runChatTest)
	default:
		fmt.Printf("Unknown mode %q. Use soak, chat, api, ping, or all.\n", *mode)
		os.Exit(1)
	}

	summaries := make([]StatsSummary, 0, len(runners))
	for _, runner := range runners {
		if ctx.Err() != nil {
			break
		}
		summary := runner(ctx, *targetURL, *numClients, *duration, *rate, *username, *password, *chatID)
		summaries = append(summaries, summary)
	}

	report := FormatStatsTable(summaries, *duration)
	fmt.Print(report)

	if *outputJSON != "" {
		data, err := json.MarshalIndent(summaries, "", "  ")
		if err == nil {
			_ = os.WriteFile(*outputJSON, data, 0644)
			fmt.Printf("Report saved to %s\n", *outputJSON)
		}
	}
}

// runAPITest stresses REST endpoints (e.g. GET /api/health, GET /api/auth/me)
func runAPITest(ctx context.Context, targetURL string, numClients int, duration time.Duration, _ int, username, password, _ string) StatsSummary {
	fmt.Printf("▶ [1/4] Running REST API Concurrency Test (%d workers)...\n", numClients)
	metrics := NewMetricRecorder("REST Health & Auth")

	client := &http.Client{Timeout: 5 * time.Second}
	testCtx, cancel := context.WithTimeout(ctx, duration)
	defer cancel()

	var wg sync.WaitGroup
	for i := 0; i < numClients; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for {
				select {
				case <-testCtx.Done():
					return
				default:
					start := time.Now()
					req, _ := http.NewRequestWithContext(testCtx, http.MethodGet, targetURL+"/api/health", nil)
					resp, err := client.Do(req)
					if err == nil && resp.StatusCode == http.StatusOK {
						_ = resp.Body.Close()
						metrics.Record(time.Since(start), true)
					} else {
						if resp != nil {
							_ = resp.Body.Close()
						}
						metrics.Record(time.Since(start), false)
					}
					time.Sleep(10 * time.Millisecond)
				}
			}
		}()
	}
	wg.Wait()
	return metrics.Snapshot(duration)
}

// runSoakTest ramps up and holds concurrent WebSocket connections
func runSoakTest(ctx context.Context, targetURL string, numClients int, duration time.Duration, _ int, username, password, _ string) StatsSummary {
	fmt.Printf("▶ [2/4] Running WebSocket Connection Soak Test (%d clients)...\n", numClients)
	metrics := NewMetricRecorder("WS Handshake & Soak")

	testCtx, cancel := context.WithTimeout(ctx, duration)
	defer cancel()

	clients := make([]*LoadClient, numClients)
	var wg sync.WaitGroup

	for i := 0; i < numClients; i++ {
		clients[i] = NewLoadClient(fmt.Sprintf("client-%d", i), targetURL, username)
	}

	for i := 0; i < numClients; i++ {
		c := clients[i]
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			start := time.Now()

			// Login
			if err := c.Login(testCtx, password); err != nil {
				metrics.Record(time.Since(start), false)
				return
			}

			// Connect WebSocket
			if err := c.ConnectSocket(testCtx); err != nil {
				metrics.Record(time.Since(start), false)
				return
			}
			metrics.Record(time.Since(start), true)

			// Hold connection open until test end
			<-testCtx.Done()
			c.Close()
		}(i)

		// Stagger connection ramp-up slightly to avoid thundering herd on local ports
		time.Sleep(5 * time.Millisecond)
	}

	wg.Wait()
	return metrics.Snapshot(duration)
}

// runPingTest measures raw WebSocket ping/pong round-trip latency
func runPingTest(ctx context.Context, targetURL string, numClients int, duration time.Duration, rate int, username, password, _ string) StatsSummary {
	fmt.Printf("▶ [3/4] Running Realtime Ping/Pong Latency Test...\n")
	metrics := NewMetricRecorder("Realtime Ping/Pong")

	testCtx, cancel := context.WithTimeout(ctx, duration)
	defer cancel()

	client := NewLoadClient("ping-tester", targetURL, username)
	if err := client.Login(testCtx, password); err != nil {
		metrics.Record(0, false)
		return metrics.Snapshot(duration)
	}
	if err := client.ConnectSocket(testCtx); err != nil {
		metrics.Record(0, false)
		return metrics.Snapshot(duration)
	}
	defer client.Close()

	client.OnPongReceived = func(rtt time.Duration) {
		metrics.Record(rtt, true)
	}

	interval := time.Second / time.Duration(rate)
	if interval < 5*time.Millisecond {
		interval = 5 * time.Millisecond
	}

	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-testCtx.Done():
			return metrics.Snapshot(duration)
		case <-ticker.C:
			if err := client.SendPing(); err != nil {
				metrics.Record(0, false)
			}
		}
	}
}

// runChatTest measures message send ack and fanout delivery latency
func runChatTest(ctx context.Context, targetURL string, numClients int, duration time.Duration, rate int, username, password, chatID string) StatsSummary {
	fmt.Printf("▶ [4/4] Running Chat Message Throughput & Fanout Test...\n")
	metrics := NewMetricRecorder("Message Send Roundtrip")

	testCtx, cancel := context.WithTimeout(ctx, duration)
	defer cancel()

	if chatID == "" {
		chatID = "general"
	}

	// Login and connect primary sender client
	sender := NewLoadClient("sender", targetURL, username)
	if err := sender.Login(testCtx, password); err != nil {
		metrics.Record(0, false)
		return metrics.Snapshot(duration)
	}
	if err := sender.ConnectSocket(testCtx); err != nil {
		metrics.Record(0, false)
		return metrics.Snapshot(duration)
	}
	defer sender.Close()

	interval := time.Second / time.Duration(rate)
	if interval < 10*time.Millisecond {
		interval = 10 * time.Millisecond
	}

	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	msgNum := 0
	for {
		select {
		case <-testCtx.Done():
			return metrics.Snapshot(duration)
		case <-ticker.C:
			msgNum++
			content := fmt.Sprintf("Load test message #%d (%d)", msgNum, time.Now().UnixNano())
			rtt, err := sender.SendMessage(testCtx, chatID, content)
			if err == nil {
				metrics.Record(rtt, true)
			} else {
				metrics.Record(0, false)
			}
		}
	}
}

// runSelfTest runs an in-process mock server to verify the test client and metric collection logic
func runSelfTest(ctx context.Context, duration time.Duration) {
	upgrader := websocket.Upgrader{CheckOrigin: func(r *http.Request) bool { return true }}
	r := chi.NewRouter()

	r.Get("/api/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"status":"ok"}`))
	})

	r.Post("/api/auth/login", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"accessToken": "mock-token-123",
			"user": map[string]any{
				"id": "mock-user-1",
			},
		})
	})

	r.Get("/socket.io/", func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		defer func() { _ = conn.Close() }()

		// Send Engine.IO open packet
		_ = conn.WriteMessage(websocket.TextMessage, []byte(`0{"sid":"test-sid","upgrades":[],"pingInterval":25000,"pingTimeout":20000}`))

		for {
			_, msg, err := conn.ReadMessage()
			if err != nil {
				return
			}
			text := string(msg)
			if text == "40" {
				_ = conn.WriteMessage(websocket.TextMessage, []byte(`40{"sid":"test-sid"}`))
			} else if text == "2" {
				_ = conn.WriteMessage(websocket.TextMessage, []byte("3"))
			} else if strings.HasPrefix(text, `42["health:ping"`) {
				// Echo pong with slight realistic processing jitter (2ms)
				time.Sleep(time.Duration(1+rand.Intn(3)) * time.Millisecond)
				_ = conn.WriteMessage(websocket.TextMessage, []byte(`42["health:pong",{"echo":`+text[17:len(text)-1]+`}]`))
			} else if strings.HasPrefix(text, "42") && strings.Contains(text, "message:send") {
				// Parse ack ID e.g. "421["message:send",...]"
				ackID := ""
				for i := 2; i < len(text); i++ {
					if text[i] >= '0' && text[i] <= '9' {
						ackID += string(text[i])
					} else {
						break
					}
				}
				time.Sleep(time.Duration(2+rand.Intn(4)) * time.Millisecond)
				if ackID != "" {
					_ = conn.WriteMessage(websocket.TextMessage, []byte(fmt.Sprintf("43%s[{\"id\":\"msg-mock\",\"content\":\"ok\"}]", ackID)))
				}
			}
		}
	})

	server := httptest.NewServer(r)
	defer server.Close()

	fmt.Printf("Mock server started at %s\n", server.URL)

	if duration > 4*time.Second {
		duration = 3 * time.Second
	}

	s1 := runAPITest(ctx, server.URL, 10, duration, 0, "mock", "mock", "")
	s2 := runSoakTest(ctx, server.URL, 15, duration, 0, "mock", "mock", "")
	s3 := runPingTest(ctx, server.URL, 1, duration, 20, "mock", "mock", "")
	s4 := runChatTest(ctx, server.URL, 1, duration, 20, "mock", "mock", "mock-chat")

	report := FormatStatsTable([]StatsSummary{s1, s2, s3, s4}, duration)
	fmt.Print(report)
}
