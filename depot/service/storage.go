package service

import (
	"github.com/gaucho-racing/depot/depot/config"
	"github.com/gaucho-racing/depot/depot/database"
	"github.com/gaucho-racing/depot/depot/model"
	"github.com/gaucho-racing/depot/depot/pkg/logger"
	"github.com/gaucho-racing/depot/depot/pkg/storage"
	ulid "github.com/gaucho-racing/ulid-go"
)

// Storage backends are DB rows. On first boot the table is seeded from the
// legacy S3_* env config under the name "s3" so existing file rows
// (storage_backend = "s3") keep resolving.
func InitializeStorage() {
	var count int64
	if err := database.DB.Model(&model.StorageBackend{}).Count(&count).Error; err != nil {
		logger.SugarLogger.Fatalf("failed to count storage backends: %v", err)
	}
	if count == 0 && config.StorageBackend == "s3" && config.S3Bucket != "" {
		provider := model.StorageProviderAWSS3
		if config.S3Endpoint != "" {
			provider = model.StorageProviderS3Compatible
		}
		seed := model.StorageBackend{
			ID:              ulid.Make().Prefixed("sb"),
			Name:            "s3",
			Provider:        provider,
			Region:          config.S3Region,
			Bucket:          config.S3Bucket,
			Endpoint:        config.S3Endpoint,
			ForcePathStyle:  config.S3ForcePathStyle == "true",
			AccessKeyID:     config.S3AccessKeyID,
			SecretAccessKey: config.S3SecretAccessKey,
			Default:         true,
			Enabled:         true,
		}
		if err := database.DB.Create(&seed).Error; err != nil {
			logger.SugarLogger.Fatalf("failed to seed default storage backend: %v", err)
		}
		logger.SugarLogger.Infof("Seeded default storage backend %q from env config (bucket: %s)", seed.Name, seed.Bucket)
	}

	if err := RebuildStorageBackends(); err != nil {
		logger.SugarLogger.Fatalf("failed to initialize storage backends: %v", err)
	}
	backends, _ := ListStorageBackends()
	enabled := 0
	for _, backend := range backends {
		if backend.Enabled {
			enabled++
		}
	}
	logger.SugarLogger.Infof("Initialized %d storage backend(s) (%d enabled)", len(backends), enabled)

}

func ActiveBackend() (storage.Backend, error) {
	backend, err := DefaultStorageBackend()
	if err != nil {
		return nil, err
	}
	return storage.GetBackend(backend.Name)
}
