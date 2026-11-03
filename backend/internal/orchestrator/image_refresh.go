package orchestrator

import (
	"context"
	"fmt"

	"github.com/docker/docker/api/types/container"
)

func (o *Orchestrator) backendImageChanged(ctx context.Context, desired string, running container.InspectResponse) (bool, error) {
	if running.Config == nil {
		return false, fmt.Errorf("inspect running backend: configuration missing")
	}
	image, err := o.dockerClient.ImageInspect(ctx, desired)
	if err != nil {
		return false, fmt.Errorf("inspect desired backend image: %w", err)
	}
	return backendImageRequiresRecreation(running.Config.Image, desired, running.Image, image.ID), nil
}

// A mutable tag can point to a different image without changing its name.
func backendImageRequiresRecreation(runningReference, desiredReference, runningID, desiredID string) bool {
	return (runningReference != desiredReference && runningID != desiredReference) || runningID != desiredID
}
