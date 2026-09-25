GOLANGCI_LINT_VERSION := v2.14.0

.PHONY: lint lint-config

# Install the matching version with: go install github.com/golangci/golangci-lint/v2/cmd/golangci-lint@$(GOLANGCI_LINT_VERSION)
lint:
	golangci-lint run --config .golangci.yml ./...

lint-config:
	golangci-lint config verify --config .golangci.yml
