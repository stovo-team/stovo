package app

import (
	"context"
	"database/sql"
)

const defaultScreenShareBitrateKbps = 5000

// screenShareBitrateForFamily is deliberately kept beside guest-meeting code:
// the setting affects the public media publisher, not normal member profiles.
func (s *Server) screenShareBitrateForFamily(ctx context.Context, familyID string) (int, error) {
	if s.guestDB == nil {
		return defaultScreenShareBitrateKbps, nil
	}
	var bitrate int
	err := s.guestDB.QueryRowContext(ctx, `SELECT screen_share_bitrate_kbps FROM families WHERE id=$1`, familyID).Scan(&bitrate)
	if err == sql.ErrNoRows {
		return defaultScreenShareBitrateKbps, errNotFound
	}
	if err != nil {
		return defaultScreenShareBitrateKbps, err
	}
	return bitrate, nil
}

func (s *Server) updateScreenShareBitrateForFamily(ctx context.Context, familyID string, bitrate int) error {
	if s.guestDB == nil {
		return nil
	}
	_, err := s.guestDB.ExecContext(ctx, `UPDATE families SET screen_share_bitrate_kbps=$1 WHERE id=$2`, bitrate, familyID)
	return err
}
