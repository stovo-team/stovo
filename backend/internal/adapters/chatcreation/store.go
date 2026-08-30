// Package chatcreation adapts the legacy atomic chat creation transaction to
// the chats feature's creation port.
package chatcreation

import (
	"context"
	featurechats "stovo-messenger/backend/internal/features/chats"
	"stovo-messenger/backend/internal/repository"
)

type Store struct{ repository *repository.Store }

func NewStore(repository *repository.Store) *Store { return &Store{repository: repository} }
func (s *Store) CreateChat(ctx context.Context, command featurechats.CreateChat) error {
	return s.repository.CreateChatWithMembers(ctx, repository.CreateChatParams{ID: command.ID, FamilyID: command.FamilyID, Type: command.Type, Title: command.Title, CreatedBy: command.CreatedBy, MediaVisibility: command.MediaVisibility, CommentsEnabled: command.CommentsEnabled, EncryptionProtocol: command.EncryptionProtocol, CreatedAt: command.CreatedAt, MemberIDs: command.MemberIDs, CreatePreferences: command.CreatePreferences})
}

func (s *Store) AddMembers(ctx context.Context, command featurechats.AddMembers) error {
	return s.repository.AddChatMembers(ctx, repository.AddChatMembersParams{ChatID: command.ChatID, UserIDs: command.UserIDs, CreatedAt: command.CreatedAt})
}
