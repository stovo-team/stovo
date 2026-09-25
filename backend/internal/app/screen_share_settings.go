package app

import (
	"context"
	"database/sql"
)

const (
	defaultScreenShareBitrateKbps = 5000
	defaultCameraBitrateKbps      = 1500
)

type familyCallMediaQuality struct {
	ScreenShareBitrateKbps          int
	CameraBitrateKbps               int
	GroupCallScreenShareBitrateKbps int
	GroupCallCameraBitrateKbps      int
	DMCallScreenShareBitrateKbps    int
	DMCallCameraBitrateKbps         int
}

func defaultFamilyCallMediaQuality() familyCallMediaQuality {
	return familyCallMediaQuality{
		ScreenShareBitrateKbps:          defaultScreenShareBitrateKbps,
		CameraBitrateKbps:               defaultCameraBitrateKbps,
		GroupCallScreenShareBitrateKbps: defaultScreenShareBitrateKbps,
		GroupCallCameraBitrateKbps:      defaultCameraBitrateKbps,
		DMCallScreenShareBitrateKbps:    defaultScreenShareBitrateKbps,
		DMCallCameraBitrateKbps:         defaultCameraBitrateKbps,
	}
}

func (s *Server) callMediaQualityForFamily(ctx context.Context, familyID string) (familyCallMediaQuality, error) {
	if s.guestDB == nil {
		return defaultFamilyCallMediaQuality(), nil
	}
	settings := familyCallMediaQuality{}
	err := s.guestDB.QueryRowContext(ctx, `
		SELECT screen_share_bitrate_kbps, camera_bitrate_kbps,
		       group_call_screen_share_bitrate_kbps, group_call_camera_bitrate_kbps,
		       dm_call_screen_share_bitrate_kbps, dm_call_camera_bitrate_kbps
		FROM families WHERE id=$1`, familyID).Scan(
		&settings.ScreenShareBitrateKbps, &settings.CameraBitrateKbps,
		&settings.GroupCallScreenShareBitrateKbps, &settings.GroupCallCameraBitrateKbps,
		&settings.DMCallScreenShareBitrateKbps, &settings.DMCallCameraBitrateKbps,
	)
	if err == sql.ErrNoRows {
		return defaultFamilyCallMediaQuality(), errNotFound
	}
	if err != nil {
		return defaultFamilyCallMediaQuality(), err
	}
	return settings, nil
}

func (s *Server) updateCallMediaQualityForFamily(ctx context.Context, familyID string, patch map[string]*int) error {
	if s.guestDB == nil {
		return nil
	}
	if len(patch) == 0 {
		return nil
	}
	_, err := s.guestDB.ExecContext(ctx, `
		UPDATE families SET
			screen_share_bitrate_kbps=COALESCE($1, screen_share_bitrate_kbps),
			camera_bitrate_kbps=COALESCE($2, camera_bitrate_kbps),
			group_call_screen_share_bitrate_kbps=COALESCE($3, group_call_screen_share_bitrate_kbps),
			group_call_camera_bitrate_kbps=COALESCE($4, group_call_camera_bitrate_kbps),
			dm_call_screen_share_bitrate_kbps=COALESCE($5, dm_call_screen_share_bitrate_kbps),
			dm_call_camera_bitrate_kbps=COALESCE($6, dm_call_camera_bitrate_kbps)
		WHERE id=$7`,
		patch["screenShareBitrateKbps"], patch["cameraBitrateKbps"],
		patch["groupCallScreenShareBitrateKbps"], patch["groupCallCameraBitrateKbps"],
		patch["dmCallScreenShareBitrateKbps"], patch["dmCallCameraBitrateKbps"], familyID,
	)
	return err
}
