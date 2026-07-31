package app

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
)

func generateVideoThumbnail(ctx context.Context, video []byte) ([]byte, error) {
	workspace, err := os.MkdirTemp("", "stovo-video-thumbnail-*")
	if err != nil {
		return nil, fmt.Errorf("create thumbnail workspace: %w", err)
	}
	defer os.RemoveAll(workspace)

	inputPath := filepath.Join(workspace, "source.video")
	outputPath := filepath.Join(workspace, "thumbnail.jpg")
	if err := os.WriteFile(inputPath, video, 0o600); err != nil {
		return nil, fmt.Errorf("write video source: %w", err)
	}

	command := exec.CommandContext(ctx, "ffmpeg",
		"-hide_banner", "-loglevel", "error",
		"-i", inputPath,
		"-map", "0:v:0",
		"-frames:v", "1",
		"-q:v", "2",
		outputPath,
	)
	if output, err := command.CombinedOutput(); err != nil {
		return nil, fmt.Errorf("extract video thumbnail: %w: %s", err, output)
	}
	thumbnail, err := os.ReadFile(outputPath)
	if err != nil {
		return nil, fmt.Errorf("read video thumbnail: %w", err)
	}
	if len(thumbnail) == 0 {
		return nil, fmt.Errorf("extract video thumbnail: empty output")
	}
	return thumbnail, nil
}
