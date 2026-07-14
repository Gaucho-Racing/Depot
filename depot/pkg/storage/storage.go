package storage

import (
	"context"
	"fmt"
	"io"
	"time"
)

type ObjectInfo struct {
	SizeBytes   int64
	Checksum    string
	ContentType string
}

type PresignedRequest struct {
	URL       string
	Method    string
	ExpiresAt time.Time
}

type Backend interface {
	Name() string
	Put(ctx context.Context, key string, body io.Reader, contentType string) error
	Get(ctx context.Context, key string) (io.ReadCloser, error)
	Stat(ctx context.Context, key string) (ObjectInfo, error)
	Delete(ctx context.Context, key string) error
	PresignGet(ctx context.Context, key string, expiry time.Duration) (PresignedRequest, error)
	PresignPut(ctx context.Context, key string, contentType string, expiry time.Duration) (PresignedRequest, error)
}

var backends = map[string]Backend{}

var ErrObjectNotFound = fmt.Errorf("object not found")

func Register(backend Backend) {
	backends[backend.Name()] = backend
}

func GetBackend(name string) (Backend, error) {
	backend, ok := backends[name]
	if !ok {
		return nil, fmt.Errorf("storage backend %q is not configured", name)
	}
	return backend, nil
}
