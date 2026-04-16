# Build stage: Use Alpine Linux for building
FROM golang:1.25-alpine AS builder

# Install build dependencies
RUN apk add --no-cache git ca-certificates

# Set working directory
WORKDIR /build

# Copy go mod files first (for better caching)
COPY go.mod go.sum ./

# Download dependencies
RUN go mod download

# Copy source code
COPY . .

# Build arguments for version info and target platform
ARG VERSION=dev
ARG BUILD_TIME
ARG TARGETPLATFORM
ARG TARGETOS
ARG TARGETARCH

# Build the binary
# -ldflags="-s -w" strips debug info for smaller binary
# CGO_ENABLED=0 ensures static binary (required for distroless)
# TARGETOS and TARGETARCH are set by Docker buildx for multi-arch builds
RUN \
  TARGETOS=${TARGETOS:-linux} \
  TARGETARCH=${TARGETARCH:-amd64} \
  CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH go build \
    -ldflags="-s -w -X main.version=${VERSION} -X main.buildTime=${BUILD_TIME}" \
    -trimpath \
    -o oneauthwatch-server .

# Verify the binary works (only if native build)
RUN ./oneauthwatch-server --version || echo "Cross-compiled binary, skipping version check"

# Create data directory owned by nonroot user (UID 65532)
# Fixes permission errors with both bind mounts and named volumes
RUN mkdir -p /data && chown 65532:65532 /data

# Shell variant: Alpine-based image with /bin/sh for docker exec access
# Build with: docker build --target runtime-shell .
# Shell-enabled runtime image for local inspection and debugging
FROM alpine:3.21 AS runtime-shell

RUN apk add --no-cache ca-certificates tzdata && \
    addgroup -g 65532 -S nonroot && \
    adduser -u 65532 -S -G nonroot -h /app nonroot

ARG VERSION=dev
LABEL maintainer="Wh1te0ne"
LABEL description="OneAuthWatch Server - Lightweight API quota tracker (shell variant)"
LABEL version="${VERSION:-dev}"

WORKDIR /app
COPY --from=builder /build/oneauthwatch-server /app/oneauthwatch-server
COPY --from=builder --chown=65532:65532 /data /data

EXPOSE 9211
ENV ONEAUTHWATCH_DB_PATH=/data/oneauthwatch.db \
    ONWATCH_PORT=9211 \
    ONWATCH_LOG_LEVEL=info

USER nonroot
ENTRYPOINT ["/app/oneauthwatch-server"]

# Default runtime stage: Use distroless for minimal, secure image
# This is the last stage so "docker build ." (no --target) builds this
FROM gcr.io/distroless/static-debian12:nonroot AS runtime

ARG VERSION=dev
LABEL maintainer="Wh1te0ne"
LABEL description="OneAuthWatch Server - Lightweight API quota tracker for Anthropic, Codex, Synthetic, Z.ai, Copilot, MiniMax, Antigravity, and Gemini CLI"
LABEL version="${VERSION:-dev}"

WORKDIR /app
COPY --from=builder /build/oneauthwatch-server /app/oneauthwatch-server
COPY --from=builder --chown=65532:65532 /data /data

EXPOSE 9211
ENV ONEAUTHWATCH_DB_PATH=/data/oneauthwatch.db \
    ONWATCH_PORT=9211 \
    ONWATCH_LOG_LEVEL=info

# distroless has no shell, use exec form
ENTRYPOINT ["/app/oneauthwatch-server"]
