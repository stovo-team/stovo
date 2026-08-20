package transcription

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
)

// DefaultSegmentDurationSec is the default chunk size in seconds for batch transcription.
const DefaultSegmentDurationSec = 60

// AudioSegment represents a slice of an audio file for batched transcription.
type AudioSegment struct {
	Data        []byte
	Filename    string
	ContentType string
	OffsetSec   float64
}

// TranscribeBatched splits large audio files into small sequential batches (e.g. 60s each)
// to prevent overloading the model's context or exceeding payload size limits, then combines
// the results into a single unified transcript.
func (c *GroqSTTClient) TranscribeBatched(ctx context.Context, req TranscribeRequest, segmentDurationSec int) (*GroqTranscriptionResponse, error) {
	if segmentDurationSec <= 0 {
		segmentDurationSec = DefaultSegmentDurationSec
	}

	// If audio is small (< 1.5MB), transcribe in a single call directly
	if len(req.AudioData) < 1024*1024*1.5 {
		return c.Transcribe(ctx, req)
	}

	segments, err := SplitAudioIntoSegments(ctx, req.AudioData, req.Filename, req.ContentType, segmentDurationSec)
	if err != nil || len(segments) <= 1 {
		// Fallback to direct single call if splitting fails or only 1 segment
		return c.Transcribe(ctx, req)
	}

	var combinedText strings.Builder
	var combinedSegments []GroqSegment
	var combinedWords []GroqWordTimestamp
	var detectedLanguage string
	var totalDuration float64
	var successCount int

	for i, seg := range segments {
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		default:
		}

		segReq := TranscribeRequest{
			AudioData:   seg.Data,
			Filename:    seg.Filename,
			ContentType: seg.ContentType,
		}

		resp, err := c.Transcribe(ctx, segReq)
		if err != nil {
			// If a single chunk fails, continue to subsequent chunks unless all fail
			continue
		}

		successCount++
		if detectedLanguage == "" && resp.Language != "" {
			detectedLanguage = resp.Language
		}

		text := strings.TrimSpace(resp.Text)
		if text != "" {
			if combinedText.Len() > 0 {
				combinedText.WriteString(" ")
			}
			combinedText.WriteString(text)
		}

		// Adjust timestamps with segment offset
		for _, s := range resp.Segments {
			s.Start += seg.OffsetSec
			s.End += seg.OffsetSec
			s.ID = len(combinedSegments)
			combinedSegments = append(combinedSegments, s)
		}

		for _, w := range resp.Words {
			w.Start += seg.OffsetSec
			w.End += seg.OffsetSec
			combinedWords = append(combinedWords, w)
		}

		chunkDur := resp.Duration
		if chunkDur <= 0 {
			chunkDur = float64(segmentDurationSec)
		}
		if i == len(segments)-1 {
			totalDuration = seg.OffsetSec + chunkDur
		}
	}

	if successCount == 0 {
		// If all chunk calls failed, try one full direct call
		return c.Transcribe(ctx, req)
	}

	return &GroqTranscriptionResponse{
		Text:     strings.TrimSpace(combinedText.String()),
		Language: detectedLanguage,
		Duration: totalDuration,
		Segments: combinedSegments,
		Words:    combinedWords,
	}, nil
}

// SplitAudioIntoSegments splits raw audio data into smaller chunks using ffmpeg if available.
func SplitAudioIntoSegments(ctx context.Context, audioData []byte, filename, contentType string, segmentDurationSec int) ([]AudioSegment, error) {
	if _, err := exec.LookPath("ffmpeg"); err != nil {
		return nil, fmt.Errorf("ffmpeg not available: %w", err)
	}

	tmpDir, err := os.MkdirTemp("", "stovo-audio-split-*")
	if err != nil {
		return nil, fmt.Errorf("create temp dir: %w", err)
	}
	defer os.RemoveAll(tmpDir)

	ext := filepath.Ext(filename)
	if ext == "" {
		switch {
		case strings.Contains(contentType, "webm"):
			ext = ".webm"
		case strings.Contains(contentType, "ogg"):
			ext = ".ogg"
		case strings.Contains(contentType, "mp3") || strings.Contains(contentType, "mpeg"):
			ext = ".mp3"
		case strings.Contains(contentType, "m4a") || strings.Contains(contentType, "mp4"):
			ext = ".m4a"
		case strings.Contains(contentType, "wav"):
			ext = ".wav"
		default:
			ext = ".webm"
		}
	}

	inputFile := filepath.Join(tmpDir, "input"+ext)
	if err := os.WriteFile(inputFile, audioData, 0600); err != nil {
		return nil, fmt.Errorf("write input file: %w", err)
	}

	outputPattern := filepath.Join(tmpDir, "chunk_%03d"+ext)

	// First try segmenting with stream copy
	cmd := exec.CommandContext(ctx, "ffmpeg",
		"-y",
		"-i", inputFile,
		"-f", "segment",
		"-segment_time", fmt.Sprintf("%d", segmentDurationSec),
		"-reset_timestamps", "1",
		"-c", "copy",
		outputPattern,
	)
	if err := cmd.Run(); err != nil {
		// If stream copy fails (e.g. keyframe alignment), transcode audio stream
		cmdRetry := exec.CommandContext(ctx, "ffmpeg",
			"-y",
			"-i", inputFile,
			"-f", "segment",
			"-segment_time", fmt.Sprintf("%d", segmentDurationSec),
			"-reset_timestamps", "1",
			outputPattern,
		)
		if errRetry := cmdRetry.Run(); errRetry != nil {
			return nil, fmt.Errorf("ffmpeg segmenting failed: %w", errRetry)
		}
	}

	files, err := filepath.Glob(filepath.Join(tmpDir, "chunk_*"+ext))
	if err != nil || len(files) == 0 {
		return nil, fmt.Errorf("no segments generated")
	}

	sort.Strings(files)

	segments := make([]AudioSegment, 0, len(files))
	for i, f := range files {
		data, err := os.ReadFile(f)
		if err != nil || len(data) == 0 {
			continue
		}
		segments = append(segments, AudioSegment{
			Data:        data,
			Filename:    fmt.Sprintf("chunk_%03d%s", i, ext),
			ContentType: contentType,
			OffsetSec:   float64(i * segmentDurationSec),
		})
	}

	return segments, nil
}
