package service

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"time"

	"github.com/gaucho-racing/depot/depot/database"
	"github.com/gaucho-racing/depot/depot/model"
	"github.com/gaucho-racing/depot/depot/pkg/storage"
	ulid "github.com/gaucho-racing/ulid-go"
)

func ListStorageBackends() ([]model.StorageBackend, error) {
	backends := []model.StorageBackend{}
	if err := database.DB.Order("created_at asc").Find(&backends).Error; err != nil {
		return nil, err
	}
	return backends, nil
}

func GetStorageBackendByName(name string) (model.StorageBackend, error) {
	var backend model.StorageBackend
	if err := database.DB.Where("name = ?", name).First(&backend).Error; err != nil {
		return model.StorageBackend{}, err
	}
	return backend, nil
}

func DefaultStorageBackend() (model.StorageBackend, error) {
	var backend model.StorageBackend
	if err := database.DB.Where("\"default\" = true AND enabled = true").First(&backend).Error; err == nil {
		return backend, nil
	}
	if err := database.DB.Where("enabled = true").Order("created_at asc").First(&backend).Error; err != nil {
		return model.StorageBackend{}, fmt.Errorf("no enabled storage backend is configured")
	}
	return backend, nil
}

// ValidateProviderRegion enforces the provider enum. Region lists in the
// catalog are UI suggestions — custom values are accepted for every
// provider; the only hard rule is that providers marked RegionRequired
// must have one.
func ValidateProviderRegion(provider model.StorageProvider, region string) error {
	catalog, ok := model.CatalogForProvider(provider)
	if !ok {
		return fmt.Errorf("unsupported provider %q", provider)
	}
	if catalog.RegionRequired && region == "" {
		return fmt.Errorf("provider %s requires a region", provider)
	}
	return nil
}

func CreateStorageBackend(backend model.StorageBackend) (model.StorageBackend, error) {
	if err := ValidateProviderRegion(backend.Provider, backend.Region); err != nil {
		return model.StorageBackend{}, err
	}
	backend.ID = ulid.Make().Prefixed("sb")
	if backend.Default {
		if err := database.DB.Model(&model.StorageBackend{}).Where("\"default\" = true").Update("default", false).Error; err != nil {
			return model.StorageBackend{}, err
		}
	}
	if err := database.DB.Create(&backend).Error; err != nil {
		return model.StorageBackend{}, err
	}
	if err := RebuildStorageBackends(); err != nil {
		return model.StorageBackend{}, err
	}
	return backend, nil
}

func UpdateStorageBackend(backend model.StorageBackend) (model.StorageBackend, error) {
	if err := ValidateProviderRegion(backend.Provider, backend.Region); err != nil {
		return model.StorageBackend{}, err
	}
	if backend.Default {
		if err := database.DB.Model(&model.StorageBackend{}).Where("\"default\" = true AND id != ?", backend.ID).Update("default", false).Error; err != nil {
			return model.StorageBackend{}, err
		}
	}
	if err := database.DB.Save(&backend).Error; err != nil {
		return model.StorageBackend{}, err
	}
	if err := RebuildStorageBackends(); err != nil {
		return model.StorageBackend{}, err
	}
	return backend, nil
}

func DeleteStorageBackend(backend model.StorageBackend) error {
	var fileCount int64
	if err := database.DB.Model(&model.File{}).Where("storage_backend = ?", backend.Name).Count(&fileCount).Error; err != nil {
		return err
	}
	var replicaCount int64
	if err := database.DB.Model(&model.FileReplica{}).Where("storage_backend = ?", backend.Name).Count(&replicaCount).Error; err != nil {
		return err
	}
	if fileCount > 0 || replicaCount > 0 {
		return fmt.Errorf("storage backend %s still holds %d files and %d replicas", backend.Name, fileCount, replicaCount)
	}
	if err := database.DB.Delete(&backend).Error; err != nil {
		return err
	}
	return RebuildStorageBackends()
}

func BuildBackendClient(ctx context.Context, backend model.StorageBackend) (storage.Backend, error) {
	switch backend.Provider {
	case model.StorageProviderAWSS3, model.StorageProviderS3Compatible:
		return storage.NewS3Backend(ctx, storage.S3Config{
			Name:            backend.Name,
			Bucket:          backend.Bucket,
			Region:          backend.Region,
			Endpoint:        backend.Endpoint,
			AccessKeyID:     backend.AccessKeyID,
			SecretAccessKey: backend.SecretAccessKey,
			ForcePathStyle:  backend.ForcePathStyle,
		})
	default:
		return nil, fmt.Errorf("unsupported provider: %s", backend.Provider)
	}
}

// Probe keys live outside the bucket-name namespace real files are keyed under
// (see UploadFile), so a probe can never collide with a stored object.
const probeKeyPrefix = ".depot-healthcheck/"

// probePayload is read back and compared byte for byte, so a backend that
// accepts the write but serves something else — credentials pointed at a
// different bucket than configured, say — fails rather than passes.
var probePayload = []byte("depot storage backend healthcheck")

// probeTimeout bounds the whole round trip. An unreachable custom endpoint
// otherwise hangs until the client's own dial timeout, and this runs inside a
// request.
const probeTimeout = 15 * time.Second

// PingStorageBackend verifies that Depot can actually use a backend rather than
// merely construct a client for it. BuildBackendClient proves nothing about
// credentials or bucket access — the AWS SDK builds clients lazily — so this
// round-trips a small object through the four operations every upload and
// download depends on: Put, Stat, Get and Delete. A backend missing
// PutObject or DeleteObject fails here instead of on someone's first upload.
//
// Works on a disabled backend too, since it builds its own client rather than
// going through the registry, which only holds enabled ones.
func PingStorageBackend(ctx context.Context, backend model.StorageBackend) error {
	client, err := BuildBackendClient(ctx, backend)
	if err != nil {
		return fmt.Errorf("failed to build client: %w", err)
	}

	probeCtx, cancel := context.WithTimeout(ctx, probeTimeout)
	defer cancel()

	key := probeKeyPrefix + ulid.Make().String()
	if err := client.Put(probeCtx, key, bytes.NewReader(probePayload), "application/octet-stream"); err != nil {
		return fmt.Errorf("failed to write to bucket %s: %w", backend.Bucket, err)
	}
	readErr := readBackProbe(probeCtx, client, key)

	// The object exists from here on, so it gets deleted whatever the read did.
	// Cleanup deliberately inherits neither the probe deadline nor the caller's
	// cancellation: a timeout partway through the read would otherwise cancel
	// the delete along with it and leave the probe object behind.
	cleanupCtx, cancelCleanup := context.WithTimeout(context.WithoutCancel(ctx), probeTimeout)
	defer cancelCleanup()
	deleteErr := client.Delete(cleanupCtx, key)

	switch {
	case readErr != nil && deleteErr != nil:
		return fmt.Errorf("%w (also failed to clean up probe object %s: %v)", readErr, key, deleteErr)
	case readErr != nil:
		return readErr
	case deleteErr != nil:
		return fmt.Errorf("wrote and read back successfully, but failed to delete probe object %s: %w", key, deleteErr)
	}
	return nil
}

func readBackProbe(ctx context.Context, client storage.Backend, key string) error {
	info, err := client.Stat(ctx, key)
	if err != nil {
		return fmt.Errorf("failed to stat the object just written: %w", err)
	}
	if info.SizeBytes != int64(len(probePayload)) {
		return fmt.Errorf("wrote %d bytes but the backend reports %d", len(probePayload), info.SizeBytes)
	}

	body, err := client.Get(ctx, key)
	if err != nil {
		return fmt.Errorf("failed to read back the object just written: %w", err)
	}
	defer body.Close()

	// One byte past the payload distinguishes a correct read from a longer one.
	got, err := io.ReadAll(io.LimitReader(body, int64(len(probePayload))+1))
	if err != nil {
		return fmt.Errorf("failed to read back the object just written: %w", err)
	}
	if !bytes.Equal(got, probePayload) {
		return fmt.Errorf("the object read back does not match what was written")
	}
	return nil
}

func RebuildStorageBackends() error {
	backends, err := ListStorageBackends()
	if err != nil {
		return err
	}
	next := map[string]storage.Backend{}
	for _, backend := range backends {
		if !backend.Enabled {
			continue
		}
		client, err := BuildBackendClient(context.Background(), backend)
		if err != nil {
			return fmt.Errorf("failed to build client for storage backend %s: %w", backend.Name, err)
		}
		next[backend.Name] = client
	}
	storage.ReplaceAll(next)
	return nil
}
