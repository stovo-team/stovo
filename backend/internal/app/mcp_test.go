package app

import (
	"bytes"
	"encoding/json"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/mark3labs/mcp-go/mcp"
)

func TestMCPPermissionsDefaultDisabled(t *testing.T) {
	perms := defaultMCPPermissions()
	for _, key := range mcpAllPermissionKeys {
		if perms.Has(key) {
			t.Fatalf("expected %s to default false", key)
		}
	}
}

func TestNormalizeMCPPermissions(t *testing.T) {
	perms := normalizeMCPPermissions(map[string]bool{
		mcpPermMessagesSend: true,
		"unknown.perm":      true,
	})
	if !perms.Has(mcpPermMessagesSend) {
		t.Fatal("expected send enabled")
	}
	if perms.Has(mcpPermMessagesRead) {
		t.Fatal("expected read disabled")
	}
	if _, ok := perms["unknown.perm"]; ok {
		t.Fatal("unknown permissions must be dropped")
	}
}

func TestClampMCPHistoryLimit(t *testing.T) {
	if got := clampMCPHistoryLimit(0); got != mcpDefaultMaxHistory {
		t.Fatalf("clamp 0 = %d, want %d", got, mcpDefaultMaxHistory)
	}
	if got := clampMCPHistoryLimit(9999); got != mcpMaxMaxHistory {
		t.Fatalf("clamp high = %d, want %d", got, mcpMaxMaxHistory)
	}
	if got := clampMCPHistoryLimit(42); got != 42 {
		t.Fatalf("clamp 42 = %d, want 42", got)
	}
}

func TestNormalizeMCPProvider(t *testing.T) {
	cases := map[string]string{
		"":               mcpProviderClaudeCode,
		"claude_code":    mcpProviderClaudeCode,
		"Claude":         mcpProviderClaudeCode,
		"codex":          mcpProviderCodex,
		"chatgpt":        mcpProviderCodex,
		"openclaw":       mcpProviderOpenClaw,
		"hermes":         mcpProviderHermes,
		"not-a-provider": "",
	}
	for input, want := range cases {
		if got := normalizeMCPProvider(input); got != want {
			t.Fatalf("normalizeMCPProvider(%q) = %q, want %q", input, got, want)
		}
	}
}

func TestNormalizeMCPAliasAndAuthMode(t *testing.T) {
	alias, err := normalizeMCPAlias("@Codex", mcpProviderCodex)
	if err != nil || alias != "codex" {
		t.Fatalf("normalizeMCPAlias(@Codex) = %q %v", alias, err)
	}
	alias, err = normalizeMCPAlias("", mcpProviderClaudeCode)
	if err != nil || alias != "claude" {
		t.Fatalf("default alias = %q %v", alias, err)
	}
	if _, err := normalizeMCPAlias("bad alias", mcpProviderClaudeCode); err == nil {
		t.Fatal("expected invalid alias error")
	}
	if got := normalizeMCPAuthMode("api_key"); got != mcpAuthModeAPI {
		t.Fatalf("auth mode = %q", got)
	}
	if got := normalizeMCPAuthMode(""); got != mcpAuthModeSubscription {
		t.Fatalf("default auth mode = %q", got)
	}
	if got := normalizeMCPAuthMode("weird"); got != "" {
		t.Fatalf("invalid auth mode = %q", got)
	}
}

func TestMCPBaseURLUsesCurrentClusterServer(t *testing.T) {
	if got, want := mcpURLForServer("https://stovo.example", "family-123"), "https://stovo.example/s/family-123/mcp"; got != want {
		t.Fatalf("mcpURLForServer() = %q, want %q", got, want)
	}
	if got, want := mcpURLForServer("https://stovo.example/s/family-123", "family-123"), "https://stovo.example/s/family-123/mcp"; got != want {
		t.Fatalf("mcpURLForServer() duplicated server route: got %q, want %q", got, want)
	}
}

func TestMCPConnectorAuthAndPolicy(t *testing.T) {
	server, httpServer, client := newTestServer(t)
	owner := setupOwner(t, client, httpServer.URL, "mcp-auth-owner", "MCP Auth Family")

	chatResp := jsonRequest(t, client, http.MethodPost, httpServer.URL+"/api/chats/group", owner.AccessToken, map[string]any{
		"title":     "MCP Allowed",
		"memberIds": []string{owner.User.ID},
	})
	if chatResp.StatusCode != http.StatusCreated {
		t.Fatalf("create chat status = %d", chatResp.StatusCode)
	}
	chat := decodeJSON[chatPublic](t, chatResp)

	otherChatResp := jsonRequest(t, client, http.MethodPost, httpServer.URL+"/api/chats/group", owner.AccessToken, map[string]any{
		"title":     "MCP Denied",
		"memberIds": []string{owner.User.ID},
	})
	if otherChatResp.StatusCode != http.StatusCreated {
		t.Fatalf("create other chat status = %d", otherChatResp.StatusCode)
	}
	otherChat := decodeJSON[chatPublic](t, otherChatResp)
	secondAllowedResp := jsonRequest(t, client, http.MethodPost, httpServer.URL+"/api/chats/group", owner.AccessToken, map[string]any{
		"title":     "MCP Also Allowed",
		"memberIds": []string{owner.User.ID},
	})
	if secondAllowedResp.StatusCode != http.StatusCreated {
		t.Fatalf("create second allowed chat status = %d", secondAllowedResp.StatusCode)
	}
	secondAllowedChat := decodeJSON[chatPublic](t, secondAllowedResp)

	createResp := jsonRequest(t, client, http.MethodPost, httpServer.URL+"/api/admin/mcp-connectors", owner.AccessToken, map[string]any{
		"name":               "Auth Connector",
		"provider":           mcpProviderCodex,
		"alias":              "codex",
		"allowedChatIds":     []string{chat.ID, secondAllowedChat.ID},
		"maxHistoryMessages": 10,
		"permissions": map[string]bool{
			mcpPermChatsList:    true,
			mcpPermMessagesRead: true,
			mcpPermMessagesSend: true,
		},
	})
	if createResp.StatusCode != http.StatusCreated {
		t.Fatalf("create connector status = %d body=%s", createResp.StatusCode, readBody(t, createResp))
	}
	created := decodeJSON[mcpConnectorCreateResponse](t, createResp)
	if created.Token == "" || created.CLICommand == "" || !strings.Contains(created.CLICommand, created.Token) {
		t.Fatalf("expected one-time token and Codex command, got %+v", created)
	}
	if created.SetupPrompt == "" || !strings.Contains(created.SetupPrompt, created.MCPURL) {
		t.Fatalf("expected setup prompt with MCP URL, got %+v", created)
	}
	if created.Connector.Provider != mcpProviderCodex {
		t.Fatalf("provider = %q, want %q", created.Connector.Provider, mcpProviderCodex)
	}
	if created.Connector.Alias != "codex" {
		t.Fatalf("alias = %q, want codex", created.Connector.Alias)
	}
	if created.Connector.AuthMode != mcpAuthModeSubscription {
		t.Fatalf("authMode = %q, want %q", created.Connector.AuthMode, mcpAuthModeSubscription)
	}
	if len(created.Connector.AllowedChatIDs) != 2 {
		t.Fatalf("allowed chats = %v, want two chat bindings", created.Connector.AllowedChatIDs)
	}
	if created.Connector.Permissions.Has(mcpPermMessagesDelete) {
		t.Fatal("delete permission should remain disabled by default")
	}

	t.Run("connector is not a chat member", func(t *testing.T) {
		chatsResp := jsonRequest(t, client, http.MethodGet, httpServer.URL+"/api/chats", owner.AccessToken, nil)
		if chatsResp.StatusCode != http.StatusOK {
			t.Fatalf("list chats status = %d body=%s", chatsResp.StatusCode, readBody(t, chatsResp))
		}
		chats := decodeJSON[[]chatPublic](t, chatsResp)
		for _, listed := range chats {
			if listed.ID != chat.ID {
				continue
			}
			for _, member := range listed.Members {
				if member.ID == created.Connector.ActorUserID {
					t.Fatal("connector was returned as a chat member")
				}
			}
			return
		}
		t.Fatal("allowed chat was not returned")
	})

	t.Run("invalid token", func(t *testing.T) {
		status, _ := mcpJSONRPC(t, httpServer.URL, "bad-token", mcpInitializeBody())
		if status != http.StatusUnauthorized {
			t.Fatalf("status = %d, want 401", status)
		}
	})

	t.Run("disabled connector", func(t *testing.T) {
		disableResp := jsonRequest(t, client, http.MethodPatch, httpServer.URL+"/api/admin/mcp-connectors/"+created.Connector.ID, owner.AccessToken, map[string]any{
			"enabled": false,
		})
		if disableResp.StatusCode != http.StatusOK {
			t.Fatalf("disable status = %d", disableResp.StatusCode)
		}
		_ = disableResp.Body.Close()
		status, _ := mcpJSONRPC(t, httpServer.URL, created.Token, mcpInitializeBody())
		if status != http.StatusUnauthorized {
			t.Fatalf("disabled status = %d, want 401", status)
		}
		enableResp := jsonRequest(t, client, http.MethodPatch, httpServer.URL+"/api/admin/mcp-connectors/"+created.Connector.ID, owner.AccessToken, map[string]any{
			"enabled": true,
		})
		if enableResp.StatusCode != http.StatusOK {
			t.Fatalf("enable status = %d", enableResp.StatusCode)
		}
		_ = enableResp.Body.Close()
	})

	t.Run("initialize and list tools", func(t *testing.T) {
		status, payload := mcpJSONRPC(t, httpServer.URL, created.Token, mcpInitializeBody())
		if status != http.StatusOK {
			t.Fatalf("initialize status = %d payload=%s", status, payload)
		}
		status, payload = mcpJSONRPC(t, httpServer.URL, created.Token, map[string]any{
			"jsonrpc": "2.0",
			"id":      2,
			"method":  "tools/list",
		})
		if status != http.StatusOK {
			t.Fatalf("tools/list status = %d payload=%s", status, payload)
		}
		if !strings.Contains(payload, "stovo_list_chats") || !strings.Contains(payload, "stovo_send_message") {
			t.Fatalf("tools/list missing expected tools: %s", payload)
		}
	})

	t.Run("list and read allowed chat", func(t *testing.T) {
		result := mcpCallTool(t, httpServer.URL, created.Token, "stovo_list_chats", map[string]any{})
		if !strings.Contains(result, chat.ID) {
			t.Fatalf("list_chats missing allowed chat: %s", result)
		}
		if strings.Contains(result, otherChat.ID) {
			t.Fatalf("list_chats leaked denied chat: %s", result)
		}

		send := mcpCallTool(t, httpServer.URL, created.Token, "stovo_send_message", map[string]any{
			"chat_id": chat.ID,
			"content": "hello from connector",
		})
		if !strings.Contains(send, "hello from connector") {
			t.Fatalf("send_message failed: %s", send)
		}

		history := mcpCallTool(t, httpServer.URL, created.Token, "stovo_get_chat_history", map[string]any{
			"chat_id": chat.ID,
			"limit":   5,
		})
		if !strings.Contains(history, "hello from connector") {
			t.Fatalf("get_chat_history missing message: %s", history)
		}
	})

	t.Run("deny unallowed chat and missing permission", func(t *testing.T) {
		deniedChat := mcpCallTool(t, httpServer.URL, created.Token, "stovo_get_chat_history", map[string]any{
			"chat_id": otherChat.ID,
			"limit":   5,
		})
		if !strings.Contains(strings.ToLower(deniedChat), "not allowed") && !strings.Contains(strings.ToLower(deniedChat), "error") {
			t.Fatalf("expected chat deny error, got %s", deniedChat)
		}

		deniedPerm := mcpCallTool(t, httpServer.URL, created.Token, "stovo_delete_message", map[string]any{
			"message_id": "missing",
		})
		if !strings.Contains(strings.ToLower(deniedPerm), "permission denied") {
			t.Fatalf("expected permission deny, got %s", deniedPerm)
		}
	})

	t.Run("regenerate invalidates old token", func(t *testing.T) {
		regenResp := jsonRequest(t, client, http.MethodPost, httpServer.URL+"/api/admin/mcp-connectors/"+created.Connector.ID+"/regenerate-token", owner.AccessToken, nil)
		if regenResp.StatusCode != http.StatusOK {
			t.Fatalf("regenerate status = %d", regenResp.StatusCode)
		}
		regenerated := decodeJSON[mcpConnectorTokenResponse](t, regenResp)
		status, _ := mcpJSONRPC(t, httpServer.URL, created.Token, mcpInitializeBody())
		if status != http.StatusUnauthorized {
			t.Fatalf("old token status = %d, want 401", status)
		}
		status, _ = mcpJSONRPC(t, httpServer.URL, regenerated.Token, mcpInitializeBody())
		if status != http.StatusOK {
			t.Fatalf("new token status = %d, want 200", status)
		}
		created.Token = regenerated.Token
	})

	t.Run("revoke", func(t *testing.T) {
		revokeResp := jsonRequest(t, client, http.MethodPost, httpServer.URL+"/api/admin/mcp-connectors/"+created.Connector.ID+"/revoke", owner.AccessToken, nil)
		if revokeResp.StatusCode != http.StatusOK {
			t.Fatalf("revoke status = %d", revokeResp.StatusCode)
		}
		_ = revokeResp.Body.Close()
		status, _ := mcpJSONRPC(t, httpServer.URL, created.Token, mcpInitializeBody())
		if status != http.StatusUnauthorized {
			t.Fatalf("revoked token status = %d, want 401", status)
		}
	})

	_ = server
}

func setupOwner(t *testing.T, client *http.Client, baseURL, username, familyName string) authResponse {
	t.Helper()
	setupResp := jsonRequest(t, client, http.MethodPost, baseURL+"/api/auth/setup", "", map[string]any{
		"familyName":  familyName,
		"username":    username,
		"password":    "secure-password",
		"displayName": "Owner",
	})
	if setupResp.StatusCode != http.StatusCreated {
		t.Fatalf("setup status = %d body=%s", setupResp.StatusCode, readBody(t, setupResp))
	}
	return decodeJSON[authResponse](t, setupResp)
}

func mcpInitializeBody() map[string]any {
	return map[string]any{
		"jsonrpc": "2.0",
		"id":      1,
		"method":  "initialize",
		"params": map[string]any{
			"protocolVersion": mcp.LATEST_PROTOCOL_VERSION,
			"capabilities":    map[string]any{},
			"clientInfo": map[string]any{
				"name":    "stovo-test",
				"version": "1.0.0",
			},
		},
	}
}

func mcpJSONRPC(t *testing.T, baseURL, token string, body any) (int, string) {
	t.Helper()
	payload, err := json.Marshal(body)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	req, err := http.NewRequest(http.MethodPost, baseURL+"/mcp", bytes.NewReader(payload))
	if err != nil {
		t.Fatalf("request: %v", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json, text/event-stream")
	req.Header.Set("Authorization", "Bearer "+token)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("do: %v", err)
	}
	raw := readBody(t, resp)
	return resp.StatusCode, raw
}

func mcpCallTool(t *testing.T, baseURL, token, name string, arguments map[string]any) string {
	t.Helper()
	_, _ = mcpJSONRPC(t, baseURL, token, mcpInitializeBody())
	status, payload := mcpJSONRPC(t, baseURL, token, map[string]any{
		"jsonrpc": "2.0",
		"id":      time.Now().UnixNano(),
		"method":  "tools/call",
		"params": map[string]any{
			"name":      name,
			"arguments": arguments,
		},
	})
	if status != http.StatusOK {
		t.Fatalf("tools/call %s status=%d payload=%s", name, status, payload)
	}
	return payload
}

func readBody(t *testing.T, resp *http.Response) string {
	t.Helper()
	defer resp.Body.Close()
	buf := new(bytes.Buffer)
	_, _ = buf.ReadFrom(resp.Body)
	return buf.String()
}
