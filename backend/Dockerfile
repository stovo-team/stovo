# syntax=docker/dockerfile:1.7

FROM arigaio/atlas:1.3.2 AS atlas

FROM golang:1.25.5-alpine3.21 AS builder

WORKDIR /app

ENV GOTOOLCHAIN=auto

COPY go.mod go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod \
    go mod download

COPY . .
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -ldflags="-s -w" -o /family-messenger ./cmd/server && \
    CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -ldflags="-s -w" -o /storage-migrate ./cmd/storage-migrate && \
    CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -ldflags="-s -w" -o /stovo-database-url ./cmd/database-url

FROM alpine:3.21

RUN apk add --no-cache ffmpeg && addgroup -S app && adduser -S -G app app

WORKDIR /app
RUN mkdir -p /app/uploads /app/logs && chown -R app:app /app

COPY --from=builder /family-messenger /usr/local/bin/family-messenger
COPY --from=builder /storage-migrate /usr/local/bin/storage-migrate
COPY --from=builder /stovo-database-url /usr/local/bin/stovo-database-url
COPY --from=atlas /atlas /usr/local/bin/atlas
COPY migrations /app/migrations

USER app

EXPOSE 8000

CMD ["family-messenger"]
