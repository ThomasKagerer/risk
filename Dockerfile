# syntax=docker/dockerfile:1
FROM golang:1.27.1-alpine AS build
WORKDIR /src
COPY go.mod ./
COPY *.go ./
COPY web/ ./web/
RUN CGO_ENABLED=0 go test ./... && CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /domination . \
    && mkdir -p /empty

FROM scratch
COPY --from=build /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
COPY --from=build /domination /domination
COPY --from=build --chown=65532:65532 /empty /data
USER 65532:65532
WORKDIR /data
ENV GOMEMLIMIT=32MiB GOGC=50
EXPOSE 8080
VOLUME ["/data"]
ENTRYPOINT ["/domination"]
CMD ["-addr", "0.0.0.0:8080", "-data", "/data", "-max-rooms", "64"]
