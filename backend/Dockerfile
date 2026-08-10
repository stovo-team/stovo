FROM golang:1.25.5-alpine3.21 AS builder

WORKDIR /app

ENV GOTOOLCHAIN=auto

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -ldflags="-s -w" -o /family-messenger ./cmd/server
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -ldflags="-s -w" -o /storage-migrate ./cmd/storage-migrate

FROM alpine:3.21

RUN apk add --no-cache ffmpeg && addgroup -S app && adduser -S -G app app

WORKDIR /app
RUN mkdir -p /app/uploads /app/logs && chown -R app:app /app

COPY --from=builder /family-messenger /usr/local/bin/family-messenger
COPY --from=builder /storage-migrate /usr/local/bin/storage-migrate

USER app

EXPOSE 8000

CMD ["family-messenger"]
