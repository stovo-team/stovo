package app

import "context"

type familyAIFeatureSettings struct {
	Translation        bool
	CallRecording      bool
	AINotes            bool
	VoiceTranscription bool
}

type familyAIFeaturePatch struct {
	Translation        *bool
	CallRecording      *bool
	AINotes            *bool
	VoiceTranscription *bool
}

func (s *Server) familyAIFeatureSettings(ctx context.Context, familyID string) (familyAIFeatureSettings, error) {
	var settings familyAIFeatureSettings
	err := s.guestDB.QueryRowContext(ctx, `
		SELECT translation_enabled, call_recording_enabled, ai_notes_enabled, voice_transcription_enabled
		FROM families WHERE id = $1
	`, familyID).Scan(&settings.Translation, &settings.CallRecording, &settings.AINotes, &settings.VoiceTranscription)
	return settings, err
}

func (s *Server) updateFamilyAIFeatureSettings(ctx context.Context, familyID string, patch familyAIFeaturePatch) error {
	_, err := s.guestDB.ExecContext(ctx, `
		UPDATE families SET
			translation_enabled = COALESCE($2, translation_enabled),
			call_recording_enabled = COALESCE($3, call_recording_enabled),
			ai_notes_enabled = COALESCE($4, ai_notes_enabled),
			voice_transcription_enabled = COALESCE($5, voice_transcription_enabled),
			updated_at = $6
		WHERE id = $1
	`, familyID, patch.Translation, patch.CallRecording, patch.AINotes, patch.VoiceTranscription, nowString())
	return err
}
