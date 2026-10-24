package http

import (
	stdhttp "net/http"

	"github.com/go-chi/chi/v5"
)

// ChatRoutes contains the already-composed inbound handlers for chats and
// messages. Authentication remains a caller concern: protected entries must
// be wrapped before they are supplied here. This transport owns only stable
// HTTP method and path dispatch.
type ChatRoutes struct {
	ListChats               stdhttp.Handler
	CreateDirectChat        stdhttp.Handler
	CreateGroupChat         stdhttp.Handler
	CreateChannelChat       stdhttp.Handler
	CreateVoiceChat         stdhttp.Handler
	GetChat                 stdhttp.Handler
	GetChatTransferSource   stdhttp.Handler
	ImportChat              stdhttp.Handler
	UpdateChat              stdhttp.Handler
	AddChatMembers          stdhttp.Handler
	UpdateChatPreferences   stdhttp.Handler
	GetMessages             stdhttp.Handler
	GetTranscriptForNotes   stdhttp.Handler
	SendMessage             stdhttp.Handler
	GetMessage              stdhttp.Handler
	AttachMessageFiles      stdhttp.Handler
	GetPins                 stdhttp.Handler
	PinMessage              stdhttp.Handler
	UnpinMessage            stdhttp.Handler
	EditMessage             stdhttp.Handler
	DeleteMessage           stdhttp.Handler
	MarkMessageRead         stdhttp.Handler
	ForwardMessage          stdhttp.Handler
	GetMessageArchive       stdhttp.Handler
	GetMessageArchiveGroups stdhttp.Handler
	ArchiveMessage          stdhttp.Handler
	AddMessageReaction      stdhttp.Handler
	RemoveMessageReaction   stdhttp.Handler
	Unfurl                  stdhttp.Handler
	CreatePoll              stdhttp.Handler
	VotePoll                stdhttp.Handler
	ClosePoll               stdhttp.Handler
	GetPollVoters           stdhttp.Handler
}

// RegisterChatRoutes installs the stable REST contract for chat and message
// operations. It deliberately does not perform authorization or business
// policy; supplied handlers remain responsible for those concerns.
func RegisterChatRoutes(router chi.Router, routes ChatRoutes) {
	router.Method(stdhttp.MethodGet, "/api/chats", routes.ListChats)
	router.Method(stdhttp.MethodPost, "/api/chats/direct", routes.CreateDirectChat)
	router.Method(stdhttp.MethodPost, "/api/chats/group", routes.CreateGroupChat)
	router.Method(stdhttp.MethodPost, "/api/chats/channel", routes.CreateChannelChat)
	router.Method(stdhttp.MethodPost, "/api/chats/voice", routes.CreateVoiceChat)
	router.Method(stdhttp.MethodGet, "/api/chats/{chatId}", routes.GetChat)
	router.Method(stdhttp.MethodGet, "/api/chats/{chatId}/transfer-source", routes.GetChatTransferSource)
	router.Method(stdhttp.MethodPost, "/api/chat-imports", routes.ImportChat)
	router.Method(stdhttp.MethodPatch, "/api/chats/{chatId}", routes.UpdateChat)
	router.Method(stdhttp.MethodPost, "/api/chats/{chatId}/members", routes.AddChatMembers)
	router.Method(stdhttp.MethodPatch, "/api/chats/{chatId}/preferences", routes.UpdateChatPreferences)
	router.Method(stdhttp.MethodGet, "/api/chats/{chatId}/messages", routes.GetMessages)
	router.Method(stdhttp.MethodGet, "/api/chats/{chatId}/messages/{messageId}/transcript", routes.GetTranscriptForNotes)
	router.Method(stdhttp.MethodPost, "/api/chats/{chatId}/messages", routes.SendMessage)
	router.Method(stdhttp.MethodGet, "/api/messages/{messageId}", routes.GetMessage)
	router.Method(stdhttp.MethodPost, "/api/messages/{messageId}/attachments", routes.AttachMessageFiles)
	router.Method(stdhttp.MethodGet, "/api/chats/{chatId}/pins", routes.GetPins)
	router.Method(stdhttp.MethodPost, "/api/chats/{chatId}/pins/{messageId}", routes.PinMessage)
	router.Method(stdhttp.MethodDelete, "/api/chats/{chatId}/pins/{messageId}", routes.UnpinMessage)
	router.Method(stdhttp.MethodPatch, "/api/messages/{messageId}", routes.EditMessage)
	router.Method(stdhttp.MethodDelete, "/api/messages/{messageId}", routes.DeleteMessage)
	router.Method(stdhttp.MethodPatch, "/api/messages/{messageId}/read", routes.MarkMessageRead)
	router.Method(stdhttp.MethodPost, "/api/messages/{messageId}/forward", routes.ForwardMessage)
	router.Method(stdhttp.MethodGet, "/api/message-archive", routes.GetMessageArchive)
	router.Method(stdhttp.MethodGet, "/api/message-archive/groups", routes.GetMessageArchiveGroups)
	router.Method(stdhttp.MethodPost, "/api/messages/{messageId}/archive", routes.ArchiveMessage)
	router.Method(stdhttp.MethodPost, "/api/messages/{messageId}/reactions", routes.AddMessageReaction)
	router.Method(stdhttp.MethodDelete, "/api/messages/{messageId}/reactions/{emoji}", routes.RemoveMessageReaction)
	router.Method(stdhttp.MethodGet, "/api/unfurl", routes.Unfurl)
	router.Method(stdhttp.MethodPost, "/api/chats/{chatId}/polls", routes.CreatePoll)
	router.Method(stdhttp.MethodPost, "/api/polls/{pollId}/vote", routes.VotePoll)
	router.Method(stdhttp.MethodPost, "/api/polls/{pollId}/close", routes.ClosePoll)
	router.Method(stdhttp.MethodGet, "/api/polls/{pollId}/voters", routes.GetPollVoters)
}
