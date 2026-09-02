FROM arigaio/atlas:1.3.2 AS atlas

FROM golang:1.25.5-alpine3.21 AS builder

WORKDIR /app

ENV GOTOOLCHAIN=auto

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -ldflags="-s -w" -o /family-messenger ./cmd/server
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -ldflags="-s -w" -o /storage-migrate ./cmd/storage-migrate
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -ldflags="-s -w" -o /stovo-database-url ./cmd/database-url

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

# Atlas is the sole schema owner. Apply the versioned, idempotent migration
# history before every backend start so dynamically provisioned tenant
# databases and existing tenant containers advance with the application image.
CMD ["/bin/sh", "-ec", "atlas migrate apply --dir file:///app/migrations --url \"$(stovo-database-url)\" && exec family-messenger"]
