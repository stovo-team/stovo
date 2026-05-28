package app

import (
	"bytes"
	"database/sql"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"slices"
	"strconv"
	"strings"
)

var defaultMediaQualityRules = []mediaQualityRule{
	{MediaType: "image", Extension: "", QualityPercent: 100},
	{MediaType: "video", Extension: "", QualityPercent: 100},
	{MediaType: "audio", Extension: "", QualityPercent: 100},
}

func (s *Server) handleGetMediaQuality(w http.ResponseWriter, _ *http.Request, user userPublic) {
	if err := s.requireAdmin(user); err != nil {
		s.detail(w, http.StatusForbidden, "Admin access required")
		return
	}
	settings, err := s.getMediaQualitySettings(user.FamilyID)
	if err != nil {
		s.detail(w, http.StatusInternalServerError, "Could not load media quality")
		return
	}
	s.json(w, http.StatusOK, settings)
}

func (s *Server) handleUpdateMediaQuality(w http.ResponseWriter, r *http.Request, user userPublic) {
	if err := s.requireAdmin(user); err != nil {
		s.detail(w, http.StatusForbidden, "Admin access required")
		return
	}
	var payload mediaQualitySettings
	if err := s.decodeJSON(r, &payload); err != nil {
		s.detail(w, http.StatusUnprocessableEntity, "Invalid request body")
		return
	}
	rules, err := normalizeMediaQualityRules(payload.Rules)
	if err != nil {
		s.detail(w, http.StatusUnprocessableEntity, err.Error())
		return
	}
	if err := s.withTx(r.Context(), func(tx *sql.Tx) error {
		if _, err := s.txExec(tx, `DELETE FROM media_quality_settings WHERE family_id = ?`, user.FamilyID); err != nil {
			return err
		}
		for _, rule := range rules {
			if _, err := s.txExec(tx, `
				INSERT INTO media_quality_settings (family_id, media_type, extension, quality_percent, updated_at)
				VALUES (?, ?, ?, ?, ?)
			`, user.FamilyID, rule.MediaType, rule.Extension, rule.QualityPercent, nowString()); err != nil {
				return err
			}
		}
		return nil
	}); err != nil {
		s.detail(w, http.StatusInternalServerError, "Could not save media quality")
		return
	}
	settings, _ := s.getMediaQualitySettings(user.FamilyID)
	s.json(w, http.StatusOK, settings)
}

func (s *Server) getMediaQualitySettings(familyID string) (mediaQualitySettings, error) {
	rows, err := s.query(`
		SELECT media_type, extension, quality_percent
		FROM media_quality_settings
		WHERE family_id = ?
		ORDER BY media_type, extension
	`, familyID)
	if err != nil {
		return mediaQualitySettings{}, err
	}
	defer rows.Close()
	rules := append([]mediaQualityRule{}, defaultMediaQualityRules...)
	for rows.Next() {
		var rule mediaQualityRule
		if err := rows.Scan(&rule.MediaType, &rule.Extension, &rule.QualityPercent); err != nil {
			return mediaQualitySettings{}, err
		}
		replaced := false
		for index, existing := range rules {
			if existing.MediaType == rule.MediaType && existing.Extension == rule.Extension {
				rules[index] = rule
				replaced = true
				break
			}
		}
		if !replaced {
			rules = append(rules, rule)
		}
	}
	return mediaQualitySettings{Rules: rules}, rows.Err()
}

func normalizeMediaQualityRules(input []mediaQualityRule) ([]mediaQualityRule, error) {
	if len(input) > 80 {
		return nil, fmt.Errorf("Too many quality rules")
	}
	rules := append([]mediaQualityRule{}, defaultMediaQualityRules...)
	seen := make(map[string]struct{}, len(input)+len(rules))
	for _, rule := range rules {
		seen[rule.MediaType+"|"+rule.Extension] = struct{}{}
	}
	for _, rule := range input {
		mediaType := strings.ToLower(strings.TrimSpace(rule.MediaType))
		if !slices.Contains([]string{"image", "video", "audio"}, mediaType) {
			return nil, fmt.Errorf("Unsupported media type")
		}
		extension, err := normalizeQualityExtension(rule.Extension)
		if err != nil {
			return nil, err
		}
		if rule.QualityPercent < 1 || rule.QualityPercent > 100 {
			return nil, fmt.Errorf("Quality must be between 1 and 100")
		}
		key := mediaType + "|" + extension
		if _, ok := seen[key]; ok && extension != "" {
			return nil, fmt.Errorf("Duplicate extension rule")
		}
		seen[key] = struct{}{}
		normalized := mediaQualityRule{MediaType: mediaType, Extension: extension, QualityPercent: rule.QualityPercent}
		replaced := false
		for index, existing := range rules {
			if existing.MediaType == mediaType && existing.Extension == extension {
				rules[index] = normalized
				replaced = true
				break
			}
		}
		if !replaced {
			rules = append(rules, normalized)
		}
	}
	return rules, nil
}

func normalizeQualityExtension(value string) (string, error) {
	extension := strings.ToLower(strings.TrimSpace(value))
	if extension == "" {
		return "", nil
	}
	if !strings.HasPrefix(extension, ".") {
		extension = "." + extension
	}
	if len(extension) > 16 {
		return "", fmt.Errorf("Extension is too long")
	}
	for _, char := range extension[1:] {
		if (char < 'a' || char > 'z') && (char < '0' || char > '9') {
			return "", fmt.Errorf("Extension may contain only letters and numbers")
		}
	}
	return extension, nil
}

func (s *Server) optimizeUploadMedia(data []byte, mimeType, filename, familyID string) []byte {
	mediaType := mediaTypeFromMime(mimeType)
	if mediaType == "" {
		return data
	}
	quality := s.mediaQualityForUpload(familyID, mediaType, filepath.Ext(filename))
	if quality >= 100 {
		return data
	}
	optimized, err := transcodeMedia(data, mimeType, filepath.Ext(filename), mediaType, quality)
	if err != nil {
		s.logger.Warnf("media.quality", "media optimization skipped type=%s extension=%s quality=%d error=%v", mediaType, filepath.Ext(filename), quality, err)
		return data
	}
	if len(optimized) == 0 || len(optimized) >= len(data) {
		return data
	}
	return optimized
}

func (s *Server) mediaQualityForUpload(familyID, mediaType, extension string) int {
	settings, err := s.getMediaQualitySettings(familyID)
	if err != nil {
		return 100
	}
	extension, _ = normalizeQualityExtension(extension)
	quality := 100
	for _, rule := range settings.Rules {
		if rule.MediaType == mediaType && rule.Extension == "" {
			quality = rule.QualityPercent
		}
	}
	for _, rule := range settings.Rules {
		if rule.MediaType == mediaType && rule.Extension == extension {
			return rule.QualityPercent
		}
	}
	return quality
}

func mediaTypeFromMime(mimeType string) string {
	switch {
	case strings.HasPrefix(mimeType, "image/"):
		return "image"
	case strings.HasPrefix(mimeType, "video/"):
		return "video"
	case strings.HasPrefix(mimeType, "audio/"):
		return "audio"
	default:
		return ""
	}
}

func transcodeMedia(data []byte, mimeType, extension, mediaType string, quality int) ([]byte, error) {
	if _, err := exec.LookPath("ffmpeg"); err != nil {
		return nil, err
	}
	extension, err := normalizeQualityExtension(extension)
	if err != nil || extension == "" {
		extension = extensionForMime(mimeType)
	}
	if extension == "" {
		return nil, fmt.Errorf("unsupported extension")
	}
	input, err := os.CreateTemp("", "family-upload-input-*"+extension)
	if err != nil {
		return nil, err
	}
	inputPath := input.Name()
	defer os.Remove(inputPath)
	if _, err := input.Write(data); err != nil {
		_ = input.Close()
		return nil, err
	}
	if err := input.Close(); err != nil {
		return nil, err
	}
	output, err := os.CreateTemp("", "family-upload-output-*"+extension)
	if err != nil {
		return nil, err
	}
	outputPath := output.Name()
	_ = output.Close()
	defer os.Remove(outputPath)

	cmd := exec.Command("ffmpeg", ffmpegArgs(inputPath, outputPath, mediaType, extension, quality)...)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return nil, fmt.Errorf("%w: %s", err, strings.TrimSpace(stderr.String()))
	}
	return os.ReadFile(outputPath)
}

func ffmpegArgs(inputPath, outputPath, mediaType, extension string, quality int) []string {
	args := []string{"-y", "-i", inputPath}
	switch mediaType {
	case "image":
		args = append(args, "-frames:v", "1", "-q:v", strconv.Itoa(imageQScale(quality)))
	case "video":
		args = append(args, "-c:v", videoCodec(extension), "-crf", strconv.Itoa(videoCRF(quality)), "-preset", "veryfast", "-c:a", "aac", "-b:a", audioBitrate(quality))
	case "audio":
		args = append(args, "-vn", "-b:a", audioBitrate(quality))
		if extension == ".ogg" {
			args = append(args, "-c:a", "libvorbis")
		}
	}
	return append(args, outputPath)
}

func extensionForMime(mimeType string) string {
	switch mimeType {
	case "image/jpeg":
		return ".jpg"
	case "image/png":
		return ".png"
	case "image/gif":
		return ".gif"
	case "image/webp":
		return ".webp"
	case "video/mp4":
		return ".mp4"
	case "video/webm":
		return ".webm"
	case "video/quicktime":
		return ".mov"
	case "audio/mpeg":
		return ".mp3"
	case "audio/mp4", "audio/aac":
		return ".m4a"
	case "audio/wav", "audio/x-wav":
		return ".wav"
	case "audio/ogg":
		return ".ogg"
	case "audio/webm":
		return ".webm"
	default:
		return ""
	}
}

func imageQScale(quality int) int {
	return 31 - ((quality - 1) * 29 / 99)
}

func videoCRF(quality int) int {
	return 51 - ((quality - 1) * 33 / 99)
}

func audioBitrate(quality int) string {
	return strconv.Itoa(32+((quality-1)*288/99)) + "k"
}

func videoCodec(extension string) string {
	if extension == ".webm" {
		return "libvpx-vp9"
	}
	return "libx264"
}
