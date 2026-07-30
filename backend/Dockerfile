FROM golang:1.25.0-alpine3.21@sha256:c8e1680f8002c64ddfba276a3c1f763097cb182402673143a89dcca4c107cf17 AS builder

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -ldflags="-s -w" -o /family-messenger ./cmd/server

FROM gcr.io/distroless/static-debian12:nonroot@sha256:f5b485ea962d9bd1186b2f6b3a061191539b905b82ec395de78cbfae51f20e35

COPY --from=builder /family-messenger /usr/local/bin/family-messenger

USER nonroot

EXPOSE 8000

CMD ["family-messenger"]
