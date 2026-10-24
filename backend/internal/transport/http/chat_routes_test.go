package http

import (
	stdhttp "net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
)

func TestRegisterChatRoutesPreservesPathsMethodsAndParameters(t *testing.T) {
	router := chi.NewRouter()
	handler := func(name string) stdhttp.Handler {
		return stdhttp.HandlerFunc(func(w stdhttp.ResponseWriter, _ *stdhttp.Request) {
			w.Header().Set("X-Route", name)
			w.WriteHeader(stdhttp.StatusNoContent)
		})
	}
	RegisterChatRoutes(router, ChatRoutes{
		ListChats: handler("list"), CreateDirectChat: handler("direct"), CreateGroupChat: handler("group"),
		CreateChannelChat: handler("channel"), CreateVoiceChat: handler("voice"), GetChat: handler("get-chat"),
		GetChatTransferSource: handler("transfer-source"), ImportChat: handler("import-chat"),
		UpdateChat: handler("update-chat"), AddChatMembers: handler("members"), UpdateChatPreferences: handler("preferences"),
		GetMessages: handler("messages"), SendMessage: handler("send"), GetMessage: handler("message"),
		AttachMessageFiles: handler("attachments"), GetPins: handler("pins"), PinMessage: handler("pin"),
		UnpinMessage: handler("unpin"), EditMessage: handler("edit"), DeleteMessage: handler("delete"),
		MarkMessageRead: handler("read"), ForwardMessage: handler("forward"), GetMessageArchive: handler("archive-list"), GetMessageArchiveGroups: handler("archive-groups"),
		ArchiveMessage: handler("archive"), AddMessageReaction: handler("reaction-add"), RemoveMessageReaction: handler("reaction-remove"),
	})

	for _, request := range []struct{ method, path, want string }{
		{stdhttp.MethodGet, "/api/chats", "list"},
		{stdhttp.MethodPost, "/api/chats/direct", "direct"},
		{stdhttp.MethodPost, "/api/chats/group", "group"},
		{stdhttp.MethodPost, "/api/chats/channel", "channel"},
		{stdhttp.MethodPost, "/api/chats/voice", "voice"},
		{stdhttp.MethodGet, "/api/chats/chat-1", "get-chat"},
		{stdhttp.MethodGet, "/api/chats/chat-1/transfer-source", "transfer-source"},
		{stdhttp.MethodPost, "/api/chat-imports", "import-chat"},
		{stdhttp.MethodPatch, "/api/chats/chat-1", "update-chat"},
		{stdhttp.MethodPost, "/api/chats/chat-1/members", "members"},
		{stdhttp.MethodPatch, "/api/chats/chat-1/preferences", "preferences"},
		{stdhttp.MethodGet, "/api/chats/chat-1/messages", "messages"},
		{stdhttp.MethodPost, "/api/chats/chat-1/messages", "send"},
		{stdhttp.MethodGet, "/api/messages/message-1", "message"},
		{stdhttp.MethodPost, "/api/messages/message-1/attachments", "attachments"},
		{stdhttp.MethodGet, "/api/chats/chat-1/pins", "pins"},
		{stdhttp.MethodPost, "/api/chats/chat-1/pins/message-1", "pin"},
		{stdhttp.MethodDelete, "/api/chats/chat-1/pins/message-1", "unpin"},
		{stdhttp.MethodPatch, "/api/messages/message-1", "edit"},
		{stdhttp.MethodDelete, "/api/messages/message-1", "delete"},
		{stdhttp.MethodPatch, "/api/messages/message-1/read", "read"},
		{stdhttp.MethodPost, "/api/messages/message-1/forward", "forward"},
		{stdhttp.MethodGet, "/api/message-archive", "archive-list"},
		{stdhttp.MethodGet, "/api/message-archive/groups", "archive-groups"},
		{stdhttp.MethodPost, "/api/messages/message-1/archive", "archive"},
		{stdhttp.MethodPost, "/api/messages/message-1/reactions", "reaction-add"},
		{stdhttp.MethodDelete, "/api/messages/message-1/reactions/thumbs-up", "reaction-remove"},
	} {
		t.Run(request.method+request.path, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			router.ServeHTTP(recorder, httptest.NewRequest(request.method, request.path, nil))
			if recorder.Code != stdhttp.StatusNoContent || recorder.Header().Get("X-Route") != request.want {
				t.Fatalf("status=%d route=%q, want status=%d route=%q", recorder.Code, recorder.Header().Get("X-Route"), stdhttp.StatusNoContent, request.want)
			}
		})
	}
	transferRouteCounts := map[string]int{"GET /api/chats/{chatId}/transfer-source": 0, "POST /api/chat-imports": 0}
	if err := chi.Walk(router, func(method, route string, _ stdhttp.Handler, _ ...func(stdhttp.Handler) stdhttp.Handler) error {
		key := method + " " + route
		if _, ok := transferRouteCounts[key]; ok {
			transferRouteCounts[key]++
		}
		return nil
	}); err != nil {
		t.Fatal(err)
	}
	for route, count := range transferRouteCounts {
		if count != 1 {
			t.Fatalf("route %q registered %d times, want once", route, count)
		}
	}
	for _, request := range []struct{ method, path string }{{stdhttp.MethodPost, "/api/chats/chat-1/transfer-source"}, {stdhttp.MethodGet, "/api/chat-imports"}} {
		recorder := httptest.NewRecorder()
		router.ServeHTTP(recorder, httptest.NewRequest(request.method, request.path, nil))
		if recorder.Code != stdhttp.StatusMethodNotAllowed {
			t.Fatalf("%s %s status=%d, want %d", request.method, request.path, recorder.Code, stdhttp.StatusMethodNotAllowed)
		}
	}
}
