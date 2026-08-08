package service

import (
	"context"
	"fmt"

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
