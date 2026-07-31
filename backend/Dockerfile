FROM golang:1.25.0-alpine3.21@sha256:c8e1680f8002c64ddfba276a3c1f763097cb182402673143a89dcca4c107cf17 AS builder

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -ldflags="-s -w" -o /family-messenger ./cmd/server
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -ldflags="-s -w" -o /storage-migrate ./cmd/storage-migrate

FROM alpine:3.21

RUN apk add --no-cache ffmpeg && addgroup -S app && adduser -S -G app app

COPY --from=builder /family-messenger /usr/local/bin/family-messenger
COPY --from=builder /storage-migrate /usr/local/bin/storage-migrate

USER app

EXPOSE 8000

CMD ["family-messenger"]
