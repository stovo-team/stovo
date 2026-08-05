package repository

import (
	"context"

	"family-messenger/backend/ent/chatmember"
)

// ListChatMemberUserIDs returns user_id values for a chat.
func (s *Store) ListChatMemberUserIDs(ctx context.Context, chatID string) ([]string, error) {
	members, err := s.Client.ChatMember.Query().
		Where(chatmember.IDEQ(chatID)).
		All(ctx)
	if err != nil {
		return nil, err
	}
	ids := make([]string, 0, len(members))
	for _, m := range members {
		ids = append(ids, m.UserID)
	}
	return ids, nil
}
