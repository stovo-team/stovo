package orchestrator

import (
	"context"
	"fmt"
	"os"
	"strings"

	networktypes "github.com/docker/docker/api/types/network"
)

func proxyEndpointSettings(slug string) *networktypes.EndpointSettings {
	return &networktypes.EndpointSettings{Aliases: []string{fmt.Sprintf("stovo-backend-%s-proxy", slug)}}
}

func (o *Orchestrator) attachProxyNetwork(ctx context.Context, containerID, slug string) error {
	networkName := strings.TrimSpace(os.Getenv("TRUSTED_PROXY_NETWORK_NAME"))
	if networkName == "" {
		return nil
	}
	inspect, err := o.dockerClient.ContainerInspect(ctx, containerID)
	if err != nil {
		return err
	}
	alias := fmt.Sprintf("stovo-backend-%s-proxy", slug)
	if inspect.NetworkSettings != nil {
		if endpoint, ok := inspect.NetworkSettings.Networks[networkName]; ok && endpoint != nil {
			for _, existingAlias := range endpoint.Aliases {
				if existingAlias == alias {
					return nil
				}
			}
			if err := o.dockerClient.NetworkDisconnect(ctx, networkName, containerID, true); err != nil {
				return err
			}
		}
	}
	return o.dockerClient.NetworkConnect(ctx, networkName, containerID, proxyEndpointSettings(slug))
}
