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
	State                  string     `json:"state"`
	Provider               *string    `json:"provider"`
	URL                    *string    `json:"url"`
	Origin                 *string    `json:"origin"`
	Message                *string    `json:"message"`
	Logs                   []string   `json:"logs"`
	AutoRestart            bool       `json:"autoRestart"`
	Restarts               int        `json:"restarts"`
	LastRestartReason      *string    `json:"lastRestartReason"`
	HealthStatus           string     `json:"healthStatus"`
	LastHealthCheckAt      *time.Time `json:"lastHealthCheckAt"`
	LastHealthError        *string    `json:"lastHealthError"`
	HealthFailureStreak    int        `json:"healthFailureStreak"`
	HealthFailureThreshold int        `json:"healthFailureThreshold"`
}

type Manager struct {
	mu                     sync.Mutex
	cmd                    *exec.Cmd
	cancel                 context.CancelFunc
	provider               *string
	url                    *string
	origin                 *string
	message                *string
	logs                   []string
	done                   chan struct{}
	restarts               int
	autoRestart            bool
	desiredRunning         bool
	runGeneration          int64
	waitingForTunnel       bool
	lastRestartReason      *string
	healthStatus           string
	lastHealthCheckAt      *time.Time
	lastHealthError        *string
	healthFailureStreak    int
	healthCheckFn          func(string) error
	healthCheckInterval    time.Duration
	healthFailureThreshold int
}

func NewManager() *Manager {
	return &Manager{
		logs:                   make([]string, 0, 32),
		done:                   make(chan struct{}),
		healthStatus:           "unknown",
		healthCheckInterval:    5 * time.Second,
		healthFailureThreshold: 3,
	}
}

func (m *Manager) ConfigureLocalTunnelHealth(checkFn func(string) error, interval time.Duration, failureThreshold int) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.healthCheckFn = checkFn
	if interval > 0 {
		m.healthCheckInterval = interval
	}
	if failureThreshold > 0 {
		m.healthFailureThreshold = failureThreshold
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
		State:                  state,
		Provider:               clonePtr(m.provider),
		URL:                    clonePtr(m.url),
		Origin:                 clonePtr(m.origin),
		Message:                clonePtr(m.message),
		Logs:                   logs,
		AutoRestart:            m.autoRestart,
		Restarts:               m.restarts,
		LastRestartReason:      clonePtr(m.lastRestartReason),
		HealthStatus:           m.healthStatus,
		LastHealthCheckAt:      cloneTimePtr(m.lastHealthCheckAt),
		LastHealthError:        clonePtr(m.lastHealthError),
		HealthFailureStreak:    m.healthFailureStreak,
		HealthFailureThreshold: m.healthFailureThreshold,
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
	m.lastRestartReason = nil
	m.autoRestart = autoRestart
	m.desiredRunning = true
	m.runGeneration++
	generation := m.runGeneration
	m.message = strPtr(providerLabel(provider) + " tunnel is starting")
	m.logs = nil
	m.done = make(chan struct{})
	done := m.done
	m.waitingForTunnel = true
	m.healthStatus = "checking"
	m.lastHealthCheckAt = nil
	m.lastHealthError = nil
	m.healthFailureStreak = 0
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
	m.lastRestartReason = nil
	m.healthStatus = "unknown"
	m.lastHealthCheckAt = nil
	m.lastHealthError = nil
	m.healthFailureStreak = 0
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
		keepGoing, hadURL, restartReason := m.runTunnelOnce(generation, origin, provider)
		if !keepGoing {
			return
		}
		m.mu.Lock()
		if m.restarts < 1000000 {
			m.restarts++
		}
		if restartReason != "" {
			m.lastRestartReason = &restartReason
		}
		message := fmt.Sprintf("%s tunnel disconnected, restarting (attempt %d)", providerLabel(provider), m.restarts)
		if restartReason != "" {
			message = fmt.Sprintf("%s tunnel restarting after %s (attempt %d)", providerLabel(provider), restartReason, m.restarts)
		}
		m.message = &message
		m.waitingForTunnel = true
		m.url = nil
		m.healthStatus = "checking"
		m.healthFailureStreak = 0
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

func (m *Manager) runTunnelOnce(generation int64, origin, provider string) (bool, bool, string) {
	command, err := tunnelCommand(provider, origin)
	if err != nil {
		msg := err.Error()
		m.mu.Lock()
		m.message = &msg
		m.cmd = nil
		m.cancel = nil
		m.waitingForTunnel = false
		m.mu.Unlock()
		return false, false, ""
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
		return false, false, ""
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
		return false, false, ""
	}

	m.mu.Lock()
	if m.runGeneration != generation || !m.desiredRunning {
		m.mu.Unlock()
		cancel()
		_ = cmd.Wait()
		return false, false, ""
	}
	m.cmd = cmd
	m.cancel = cancel
	m.mu.Unlock()

	hadURL := false
	restartReason := ""
	var healthCancel context.CancelFunc
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
				m.healthStatus = "checking"
				m.lastHealthError = nil
				m.healthFailureStreak = 0
				hadURL = true
				if provider == "localtunnel" && m.healthCheckFn != nil {
					healthCtx, cancelHealth := context.WithCancel(ctx)
					healthCancel = cancelHealth
					go m.monitorLocalTunnelHealth(healthCtx, tunnelURL, cancel, &restartReason)
				} else {
					m.healthStatus = "healthy"
				}
			}
			m.mu.Unlock()
		}
	}
	if healthCancel != nil {
		healthCancel()
	}
	_ = cmd.Wait()

	m.mu.Lock()
	defer m.mu.Unlock()
	if m.runGeneration != generation || !m.desiredRunning {
		m.cmd = nil
		m.cancel = nil
		m.waitingForTunnel = false
		return false, hadURL, restartReason
	}
	m.cmd = nil
	m.cancel = nil
	m.waitingForTunnel = false
	if !m.autoRestart {
		if m.url == nil {
			message := providerLabel(provider) + " exited before returning a tunnel URL"
			m.message = &message
		}
		return false, hadURL, restartReason
	}
	return true, hadURL, restartReason
}

func (m *Manager) monitorLocalTunnelHealth(ctx context.Context, publicURL string, stopTunnel context.CancelFunc, restartReason *string) {
	if m.healthCheckFn == nil {
		return
	}
	ticker := time.NewTicker(m.healthCheckInterval)
	defer ticker.Stop()

	runCheck := func() bool {
		err := m.healthCheckFn(publicURL)
		now := time.Now().UTC()
		m.mu.Lock()
		defer m.mu.Unlock()
		m.lastHealthCheckAt = &now
		if err == nil {
			m.healthStatus = "healthy"
			m.lastHealthError = nil
			m.healthFailureStreak = 0
			return false
		}
		msg := err.Error()
		m.lastHealthError = &msg
		m.healthFailureStreak++
		m.healthStatus = "degraded"
		if m.healthFailureStreak >= m.healthFailureThreshold {
			reason := fmt.Sprintf("health check failure (%d/%d): %s", m.healthFailureStreak, m.healthFailureThreshold, msg)
			m.message = &reason
			*restartReason = "repeated health check failures"
			return true
		}
		return false
	}

	if runCheck() {
		stopTunnel()
		return
	}
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if runCheck() {
				stopTunnel()
				return
			}
		}
	}
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

func cloneTimePtr(value *time.Time) *time.Time {
	if value == nil {
		return nil
	}
	copy := *value
	return &copy
}

func strPtr(value string) *string {
	return &value
}
