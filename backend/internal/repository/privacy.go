package repository

import (
	"context"

	"entgo.io/ent/dialect/sql"

	"stovo-messenger/backend/ent/userblock"
)

// ListBlockedUserIDs returns blocked_user_id values for a blocker, newest first.
func (s *Store) ListBlockedUserIDs(ctx context.Context, blockerUserID string) ([]string, error) {
	blocks, err := s.Client.UserBlock.Query().
		Where(userblock.IDEQ(blockerUserID)).
		Order(userblock.ByCreatedAt(sql.OrderDesc())).
		All(ctx)
	if err != nil {
		return nil, err
	}
	ids := make([]string, 0, len(blocks))
	for _, b := range blocks {
		ids = append(ids, b.BlockedUserID)
	}
	return ids, nil
}

// BlockUser inserts a block row; ON CONFLICT DO NOTHING.
func (s *Store) BlockUser(ctx context.Context, blockerUserID, blockedUserID, createdAt string) error {
	return s.Client.UserBlock.Create().
		SetID(blockerUserID).
		SetBlockedUserID(blockedUserID).
		SetCreatedAt(createdAt).
		OnConflictColumns(userblock.FieldID, userblock.FieldBlockedUserID).
		Ignore().
		Exec(ctx)
}

// UnblockUser deletes a block row.
func (s *Store) UnblockUser(ctx context.Context, blockerUserID, blockedUserID string) error {
	_, err := s.Client.UserBlock.Delete().
		Where(
			userblock.IDEQ(blockerUserID),
			userblock.BlockedUserIDEQ(blockedUserID),
		).
		Exec(ctx)
	return err
}

// DirectContactBlocked reports whether either user has blocked the other.
func (s *Store) DirectContactBlocked(ctx context.Context, firstUserID, secondUserID string) (bool, error) {
	count, err := s.Client.UserBlock.Query().
		Where(userblock.Or(
			userblock.And(
				userblock.IDEQ(firstUserID),
				userblock.BlockedUserIDEQ(secondUserID),
			),
			userblock.And(
				userblock.IDEQ(secondUserID),
				userblock.BlockedUserIDEQ(firstUserID),
			),
		)).
		Count(ctx)
	if err != nil {
		return false, err
	}
	return count > 0, nil
}
