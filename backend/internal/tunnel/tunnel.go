package tunnel

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"net/url"
	"os/exec"
	"regexp"
	"strings"
	"sync"
	"time"
)

var tunnelURLPattern = regexp.MustCompile(`https://[a-zA-Z0-9.-]+\.(?:trycloudflare\.com|cfargotunnel\.com|loca\.lt|localtunnel\.me)`)

func ExtractURL(line string) string {
	return tunnelURLPattern.FindString(line)
}

type Snapshot struct {
	State       string   `json:"state"`
	Provider    *string  `json:"provider"`
	URL         *string  `json:"url"`
	Origin      *string  `json:"origin"`
	Message     *string  `json:"message"`
	Logs        []string `json:"logs"`
	AutoRestart bool     `json:"autoRestart"`
	Restarts    int      `json:"restarts"`
}

type Manager struct {
	mu               sync.Mutex
	cmd              *exec.Cmd
	cancel           context.CancelFunc
	provider         *string
	url              *string
	origin           *string
	message          *string
	logs             []string
	done             chan struct{}
	restarts         int
	autoRestart      bool
	desiredRunning   bool
	runGeneration    int64
	waitingForTunnel bool
}

func NewManager() *Manager {
	return &Manager{
		logs: make([]string, 0, 32),
		done: make(chan struct{}),
	}
}

func (m *Manager) Status() Snapshot {
	m.mu.Lock()
	defer m.mu.Unlock()

	state := "stopped"
	if m.cmd != nil && m.cmd.ProcessState == nil {
		if m.url != nil {
			state = "running"
		} else {
			state = "starting"
		}
	} else if m.desiredRunning && m.waitingForTunnel {
		state = "starting"
	} else if m.provider != nil && m.url == nil && m.message != nil {
		state = "error"
	}

	logs := make([]string, len(m.logs))
	copy(logs, m.logs)
	return Snapshot{
		State:       state,
		Provider:    clonePtr(m.provider),
		URL:         clonePtr(m.url),
		Origin:      clonePtr(m.origin),
		Message:     clonePtr(m.message),
		Logs:        logs,
		AutoRestart: m.autoRestart,
		Restarts:    m.restarts,
	}
}

func (m *Manager) Start(origin, provider string, autoRestart bool) Snapshot {
	provider = strings.TrimSpace(provider)
	if provider == "" {
		provider = "cloudflare"
	}
	if provider != "cloudflare" && provider != "localtunnel" {
		msg := "Unsupported tunnel provider: " + provider
		m.mu.Lock()
		m.provider = &provider
		m.origin = &origin
		m.message = &msg
		m.url = nil
		m.logs = nil
		m.mu.Unlock()
		return m.Status()
	}

	_ = m.Stop()

	command, err := tunnelCommand(provider, origin)
	if err != nil {
		msg := err.Error()
		m.mu.Lock()
		m.provider = &provider
		m.origin = &origin
		m.message = &msg
		m.url = nil
		m.logs = nil
		m.mu.Unlock()
		return m.Status()
	}
	_ = command

	m.mu.Lock()
	m.provider = &provider
	m.origin = &origin
	m.url = nil
	m.restarts = 0
	m.autoRestart = autoRestart
	m.desiredRunning = true
	m.runGeneration++
	generation := m.runGeneration
	m.message = strPtr(providerLabel(provider) + " tunnel is starting")
	m.logs = nil
	m.done = make(chan struct{})
	done := m.done
	m.waitingForTunnel = true
	m.mu.Unlock()

	go m.runManagedTunnel(generation, origin, provider, autoRestart, done)

	deadline := time.Now().Add(35 * time.Second)
	for time.Now().Before(deadline) {
		snapshot := m.Status()
		if snapshot.URL != nil || snapshot.State == "error" {
			return snapshot
		}
		time.Sleep(250 * time.Millisecond)
	}

	m.mu.Lock()
	timeoutMessage := "Timed out while waiting for " + providerLabel(provider) + " to create a tunnel URL"
	m.message = &timeoutMessage
	m.waitingForTunnel = false
	m.mu.Unlock()
	return m.Status()
}

func (m *Manager) Stop() Snapshot {
	m.mu.Lock()
	cancel := m.cancel
	done := m.done
	running := m.cmd != nil
	url := clonePtr(m.url)
	m.desiredRunning = false
	m.waitingForTunnel = false
	m.mu.Unlock()

	if cancel != nil {
		cancel()
	}
	if running {
		select {
		case <-done:
		case <-time.After(6 * time.Second):
		}
	}

	m.mu.Lock()
	message := "Public tunnel stopped"
	m.message = &message
	m.cmd = nil
	m.cancel = nil
	m.url = url
	m.autoRestart = false
	if m.provider == nil {
		m.logs = nil
	}
	m.mu.Unlock()
	return m.Status()
}

func (m *Manager) runManagedTunnel(generation int64, origin, provider string, autoRestart bool, done chan struct{}) {
	defer close(done)
	backoff := 2 * time.Second
	for {
		keepGoing, hadURL := m.runTunnelOnce(generation, origin, provider)
		if !keepGoing {
			return
		}
		m.mu.Lock()
		if m.restarts < 1000000 {
			m.restarts++
		}
		message := fmt.Sprintf("%s tunnel disconnected, restarting (attempt %d)", providerLabel(provider), m.restarts)
		m.message = &message
		m.waitingForTunnel = true
		m.url = nil
		m.mu.Unlock()
		if !autoRestart {
			return
		}
		if hadURL {
			backoff = 2 * time.Second
		} else if backoff < 15*time.Second {
			backoff += 2 * time.Second
		}
		time.Sleep(backoff)
	}
}

func (m *Manager) runTunnelOnce(generation int64, origin, provider string) (bool, bool) {
	command, err := tunnelCommand(provider, origin)
	if err != nil {
		msg := err.Error()
		m.mu.Lock()
		m.message = &msg
		m.cmd = nil
		m.cancel = nil
		m.waitingForTunnel = false
		m.mu.Unlock()
		return false, false
	}

	ctx, cancel := context.WithCancel(context.Background())
	cmd := exec.CommandContext(ctx, command[0], command[1:]...)
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		cancel()
		msg := err.Error()
		m.mu.Lock()
		m.message = &msg
		m.cmd = nil
		m.cancel = nil
		m.waitingForTunnel = false
		m.mu.Unlock()
		return false, false
	}
	cmd.Stderr = cmd.Stdout
	if err := cmd.Start(); err != nil {
		cancel()
		msg := err.Error()
		m.mu.Lock()
		m.message = &msg
		m.cmd = nil
		m.cancel = nil
		m.waitingForTunnel = false
		m.mu.Unlock()
		return false, false
	}

	m.mu.Lock()
	if m.runGeneration != generation || !m.desiredRunning {
		m.mu.Unlock()
		cancel()
		_ = cmd.Wait()
		return false, false
	}
	m.cmd = cmd
	m.cancel = cancel
	m.mu.Unlock()

	hadURL := false
	scanner := bufio.NewScanner(stdout)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line != "" {
			m.appendLog(line)
		}
		if tunnelURL := ExtractURL(line); tunnelURL != "" {
			m.mu.Lock()
			if m.url == nil {
				m.url = &tunnelURL
				message := providerLabel(provider) + " tunnel is running"
				m.message = &message
				m.waitingForTunnel = false
				hadURL = true
			}
			m.mu.Unlock()
		}
	}
	_ = cmd.Wait()

	m.mu.Lock()
	defer m.mu.Unlock()
	if m.runGeneration != generation || !m.desiredRunning {
		m.cmd = nil
		m.cancel = nil
		m.waitingForTunnel = false
		return false, hadURL
	}
	m.cmd = nil
	m.cancel = nil
	m.waitingForTunnel = false
	if !m.autoRestart {
		if m.url == nil {
			message := providerLabel(provider) + " exited before returning a tunnel URL"
			m.message = &message
		}
		return false, hadURL
	}
	return true, hadURL
}

func (m *Manager) appendLog(line string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.logs = append(m.logs, line)
	if len(m.logs) > 30 {
		m.logs = append([]string(nil), m.logs[len(m.logs)-30:]...)
	}
}

func tunnelCommand(provider, origin string) ([]string, error) {
	switch provider {
	case "cloudflare":
		path, err := exec.LookPath("cloudflared")
		if err != nil {
			return nil, errors.New("cloudflared is not installed in the backend environment")
		}
		return []string{path, "tunnel", "--no-autoupdate", "--url", origin}, nil
	case "localtunnel":
		path, err := exec.LookPath("lt")
		if err != nil {
			return nil, errors.New("localtunnel is not installed in the backend environment")
		}
		parsed, err := url.Parse(origin)
		if err != nil {
			return nil, err
		}
		port := parsed.Port()
		if port == "" {
			if parsed.Scheme == "https" {
				port = "443"
			} else {
				port = "80"
			}
		}
		host := parsed.Hostname()
		if host == "" {
			host = "127.0.0.1"
		}
		if host == "" || host == "127.0.0.1" || host == "localhost" || host == "::1" {
			return []string{path, "--port", port}, nil
		}

		return []string{path, "--port", port, "--local-host", host}, nil
	default:
		return nil, errors.New("unsupported tunnel provider")
	}
}

func providerLabel(provider string) string {
	if provider == "cloudflare" {
		return "Cloudflare"
	}
	if provider == "localtunnel" {
		return "LocalTunnel"
	}
	return "Tunnel"
}

func clonePtr(value *string) *string {
	if value == nil {
		return nil
	}
	copy := *value
	return &copy
}

func strPtr(value string) *string {
	return &value
}
