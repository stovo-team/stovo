package transcription

import (
	"fmt"
	"sort"
)

// PackageTargetDurationMs is the target duration per package (~60 seconds).
const PackageTargetDurationMs = 60_000

// MaxPackageDurationMs is the maximum duration per package (~120 seconds).
const MaxPackageDurationMs = 120_000

// SilenceGapMs is the silence inserted between non-contiguous regions in the packed audio.
const SilenceGapMs = 300


// BuildPackages groups a participant's speech regions into packages.
// Regions must be sorted by CallStartMs.
func BuildPackages(participantID string, regions []SpeechRegion, idGen func() string) []SpeechPackage {
	if len(regions) == 0 {
		return nil
	}

	// Sort by call start time
	sort.Slice(regions, func(i, j int) bool {
		return regions[i].CallStartMs < regions[j].CallStartMs
	})

	var packages []SpeechPackage
	var current *SpeechPackage
	var currentPackedOffset int64

	for _, region := range regions {
		if region.DurationMs <= 0 {
			continue
		}

		if current == nil || currentPackedOffset+region.DurationMs > MaxPackageDurationMs {
			if current != nil {
				packages = append(packages, *current)
			}
			current = &SpeechPackage{
				PackageID:     idGen(),
				ParticipantID: participantID,
			}
			currentPackedOffset = 0
		}

		pr := PackageRegion{
			PackedStartMs: currentPackedOffset,
			PackedEndMs:   currentPackedOffset + region.DurationMs,
			CallStartMs:   region.CallStartMs,
			CallEndMs:     region.CallEndMs,
		}
		current.Regions = append(current.Regions, pr)
		currentPackedOffset += region.DurationMs + SilenceGapMs
		current.TotalDurationMs += region.DurationMs
	}

	if current != nil && len(current.Regions) > 0 {
		packages = append(packages, *current)
	}

	return packages
}

// PackedTimeToCallTime converts a package-relative timestamp to a call-relative timestamp.
// Returns an error if the packed time does not fall within any known region.
func PackedTimeToCallTime(pkg SpeechPackage, packedMs int64) (int64, error) {
	for _, region := range pkg.Regions {
		if packedMs >= region.PackedStartMs && packedMs <= region.PackedEndMs {
			offset := packedMs - region.PackedStartMs
			return region.CallStartMs + offset, nil
		}
	}
	// If in a silence gap between regions, snap to the end of the preceding region
	for i := 0; i < len(pkg.Regions)-1; i++ {
		if packedMs > pkg.Regions[i].PackedEndMs && packedMs < pkg.Regions[i+1].PackedStartMs {
			return pkg.Regions[i].CallEndMs, nil
		}
	}
	return 0, fmt.Errorf("packed time %dms is outside all package regions", packedMs)
}

// MergeOverlappingRegions merges speech regions that are within gapMs of each other.
func MergeOverlappingRegions(regions []SpeechRegion, gapMs int64) []SpeechRegion {
	if len(regions) == 0 {
		return nil
	}
	sort.Slice(regions, func(i, j int) bool {
		return regions[i].CallStartMs < regions[j].CallStartMs
	})

	merged := []SpeechRegion{regions[0]}
	for _, r := range regions[1:] {
		last := &merged[len(merged)-1]
		if r.CallStartMs <= last.CallEndMs+gapMs {
			if r.CallEndMs > last.CallEndMs {
				last.CallEndMs = r.CallEndMs
				last.DurationMs = last.CallEndMs - last.CallStartMs
			}
		} else {
			merged = append(merged, r)
		}
	}
	return merged
}
