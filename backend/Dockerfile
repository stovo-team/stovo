FROM golang:1.25-alpine AS builder

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o /family-messenger ./cmd/server

FROM alpine:3.21

RUN apk add --no-cache ca-certificates nodejs npm curl ffmpeg \
    && curl -fsSL "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64" -o /usr/local/bin/cloudflared \
    && chmod +x /usr/local/bin/cloudflared \
    && npm install -g localtunnel@latest

WORKDIR /app

COPY --from=builder /family-messenger /usr/local/bin/family-messenger

EXPOSE 8000

CMD ["family-messenger"]
