package service

import (
	"context"

	"github.com/gaucho-racing/depot/depot/config"
	"github.com/gaucho-racing/depot/depot/pkg/logger"
	"github.com/gaucho-racing/depot/depot/pkg/storage"
)

func InitializeStorage() {
	switch config.StorageBackend {
	case "s3":
		backend, err := storage.NewS3Backend(context.Background(), storage.S3Config{
			Bucket:          config.S3Bucket,
			Region:          config.S3Region,
			Endpoint:        config.S3Endpoint,
			AccessKeyID:     config.S3AccessKeyID,
			SecretAccessKey: config.S3SecretAccessKey,
			ForcePathStyle:  config.S3ForcePathStyle == "true",
		})
		if err != nil {
			logger.SugarLogger.Fatalf("failed to initialize s3 storage backend: %v", err)
		}
		storage.Register(backend)
		logger.SugarLogger.Infof("Initialized s3 storage backend (bucket: %s)", config.S3Bucket)
	default:
		logger.SugarLogger.Fatalf("unknown storage backend: %s", config.StorageBackend)
	}
}

func ActiveBackend() (storage.Backend, error) {
	return storage.GetBackend(config.StorageBackend)
}
