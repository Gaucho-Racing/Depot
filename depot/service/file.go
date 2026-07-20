package service

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"time"

	"github.com/gaucho-racing/depot/depot/config"
	"github.com/gaucho-racing/depot/depot/database"
	"github.com/gaucho-racing/depot/depot/model"
	"github.com/gaucho-racing/depot/depot/pkg/storage"
	ulid "github.com/gaucho-racing/ulid-go"
)

func expiryDuration() time.Duration {
	if config.PresignExpiryDuration > 0 {
		return config.PresignExpiryDuration
	}
	return 15 * time.Minute
}

func GetFileByID(bucketID string, fileID string) (model.File, error) {
	var file model.File
	if err := database.DB.Where("bucket_id = ? AND id = ?", bucketID, fileID).First(&file).Error; err != nil {
		return model.File{}, err
	}
	return file, nil
}

type FileQuery struct {
	BucketIDs  []string
	PathPrefix string
	Search     string
	Status     model.FileStatus
	Limit      int
	Offset     int
}

func ListFiles(q FileQuery) ([]model.File, error) {
	files := []model.File{}
	query := database.DB.Where("bucket_id IN ?", q.BucketIDs)
	if q.PathPrefix != "" {
		query = query.Where("path LIKE ?", q.PathPrefix+"%")
	}
	if q.Search != "" {
		pattern := "%" + q.Search + "%"
		query = query.Where("name ILIKE ? OR path ILIKE ?", pattern, pattern)
	}
	if q.Status != "" {
		query = query.Where("status = ?", q.Status)
	}
	if err := query.Order("created_at desc").Limit(q.Limit).Offset(q.Offset).Find(&files).Error; err != nil {
		return nil, err
	}
	return files, nil
}

type countingReader struct {
	reader io.Reader
	count  int64
}

func (r *countingReader) Read(p []byte) (int, error) {
	n, err := r.reader.Read(p)
	r.count += int64(n)
	return n, err
}

func UploadFile(ctx context.Context, bucket model.Bucket, file model.File, body io.Reader) (model.File, error) {
	backend, err := ActiveBackend()
	if err != nil {
		return model.File{}, err
	}

	file.ID = ulid.Make().Prefixed("file")
	file.BucketID = bucket.ID
	file.BucketName = bucket.Name
	file.StorageBackend = backend.Name()
	file.StorageKey = bucket.Name + "/" + file.ID
	file.Status = model.FileStatusActive

	hasher := sha256.New()
	counter := &countingReader{reader: io.TeeReader(body, hasher)}
	if err := backend.Put(ctx, file.StorageKey, counter, file.ContentType); err != nil {
		return model.File{}, fmt.Errorf("failed to write file to storage: %w", err)
	}
	file.SizeBytes = counter.count
	file.Checksum = "sha256:" + hex.EncodeToString(hasher.Sum(nil))

	if err := database.DB.Create(&file).Error; err != nil {
		if deleteErr := backend.Delete(ctx, file.StorageKey); deleteErr != nil {
			return model.File{}, fmt.Errorf("failed to save file metadata: %w (orphaned object %s: %v)", err, file.StorageKey, deleteErr)
		}
		return model.File{}, fmt.Errorf("failed to save file metadata: %w", err)
	}
	return file, nil
}

func InitiateUpload(ctx context.Context, bucket model.Bucket, file model.File) (model.File, storage.PresignedRequest, error) {
	backend, err := ActiveBackend()
	if err != nil {
		return model.File{}, storage.PresignedRequest{}, err
	}

	file.ID = ulid.Make().Prefixed("file")
	file.BucketID = bucket.ID
	file.BucketName = bucket.Name
	file.StorageBackend = backend.Name()
	file.StorageKey = bucket.Name + "/" + file.ID
	file.Status = model.FileStatusPending

	request, err := backend.PresignPut(ctx, file.StorageKey, file.ContentType, expiryDuration())
	if err != nil {
		return model.File{}, storage.PresignedRequest{}, fmt.Errorf("failed to presign upload: %w", err)
	}
	if err := database.DB.Create(&file).Error; err != nil {
		return model.File{}, storage.PresignedRequest{}, fmt.Errorf("failed to save file metadata: %w", err)
	}
	return file, request, nil
}

func CompleteUpload(ctx context.Context, file model.File) (model.File, error) {
	backend, err := storage.GetBackend(file.StorageBackend)
	if err != nil {
		return model.File{}, err
	}

	info, err := backend.Stat(ctx, file.StorageKey)
	if err != nil {
		if err == storage.ErrObjectNotFound {
			return model.File{}, fmt.Errorf("no object has been uploaded for this file")
		}
		return model.File{}, fmt.Errorf("failed to verify uploaded object: %w", err)
	}

	file.SizeBytes = info.SizeBytes
	file.Checksum = "etag:" + info.Checksum
	if file.ContentType == "" {
		file.ContentType = info.ContentType
	}
	file.Status = model.FileStatusActive
	if err := database.DB.Save(&file).Error; err != nil {
		return model.File{}, err
	}
	return file, nil
}

func UpdateFile(file model.File) (model.File, error) {
	if err := database.DB.Save(&file).Error; err != nil {
		return model.File{}, err
	}
	return file, nil
}

func DeleteFile(ctx context.Context, file model.File) error {
	backend, err := storage.GetBackend(file.StorageBackend)
	if err != nil {
		return err
	}
	if err := backend.Delete(ctx, file.StorageKey); err != nil && err != storage.ErrObjectNotFound {
		return fmt.Errorf("failed to delete file from storage: %w", err)
	}
	return database.DB.Delete(&file).Error
}

func OpenFile(ctx context.Context, file model.File) (io.ReadCloser, error) {
	backend, err := storage.GetBackend(file.StorageBackend)
	if err != nil {
		return nil, err
	}
	return backend.Get(ctx, file.StorageKey)
}

func PresignDownload(ctx context.Context, file model.File) (storage.PresignedRequest, error) {
	backend, err := storage.GetBackend(file.StorageBackend)
	if err != nil {
		return storage.PresignedRequest{}, err
	}
	return backend.PresignGet(ctx, file.StorageKey, expiryDuration())
}
