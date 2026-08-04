package storage

import (
	"context"
	"fmt"
	"io"
	"sync"
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

var (
	backendsMu sync.RWMutex
	backends   = map[string]Backend{}
)

var ErrObjectNotFound = fmt.Errorf("object not found")

func Register(backend Backend) {
	backendsMu.Lock()
	defer backendsMu.Unlock()
	backends[backend.Name()] = backend
}

func ReplaceAll(next map[string]Backend) {
	backendsMu.Lock()
	defer backendsMu.Unlock()
	backends = next
}

func GetBackend(name string) (Backend, error) {
	backendsMu.RLock()
	defer backendsMu.RUnlock()
	backend, ok := backends[name]
	if !ok {
		return nil, fmt.Errorf("storage terminal %q is not configured", name)
	}
	return backend, nil
}
