package service

import (
	"context"
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

// GetFileByID resolves a file from its id alone. Ids are ULIDs, so the id
// already determines the bucket — callers do not have to know it.
func GetFileByID(fileID string) (model.File, error) {
	var file model.File
	if err := database.DB.Where("id = ?", fileID).First(&file).Error; err != nil {
		return model.File{}, err
	}
	return file, nil
}

// GetBucketFileByID resolves a file within a known bucket, for the routes that
// address files under their bucket.
func GetBucketFileByID(bucketID string, fileID string) (model.File, error) {
	var file model.File
	if err := database.DB.Where("bucket_id = ? AND id = ?", bucketID, fileID).First(&file).Error; err != nil {
		return model.File{}, err
	}
	return file, nil
}

type FileQuery struct {
	BucketIDs         []string
	PathPrefix        string
	Search            string
	CreatedByEntityID string
	CreatedByClientID string
	Status            model.FileStatus
	Limit             int
	Offset            int
}

func ListFiles(q FileQuery) ([]model.File, error) {
	files := []model.File{}
	query := database.DB.Where("bucket_id IN ?", q.BucketIDs)
	if q.PathPrefix != "" {
		query = query.Where("path LIKE ?", q.PathPrefix+"%")
	}
	if q.Search != "" {
		pattern := "%" + q.Search + "%"
		query = query.Where("original_name ILIKE ? OR path ILIKE ?", pattern, pattern)
	}
	if q.CreatedByEntityID != "" {
		query = query.Where("created_by_entity_id = ?", q.CreatedByEntityID)
	}
	if q.CreatedByClientID != "" {
		query = query.Where("created_by_client_id = ?", q.CreatedByClientID)
	}
	if q.Status != "" {
		query = query.Where("status = ?", q.Status)
	}
	if err := query.Order("created_at desc").Limit(q.Limit).Offset(q.Offset).Find(&files).Error; err != nil {
		return nil, err
	}
	return files, nil
}

func ResolveUploadBackend(bucket model.Bucket, requestedPrimary string) (model.StorageBackend, error) {
	primaryName := bucket.PrimaryStorageBackend
	if primaryName == "" {
		return model.StorageBackend{}, fmt.Errorf("bucket %q has no primary storage backend", bucket.Name)
	}
	if requestedPrimary != "" && requestedPrimary != primaryName {
		return model.StorageBackend{}, fmt.Errorf("bucket %q uses primary storage backend %q", bucket.Name, primaryName)
	}
	primary, err := GetStorageBackendByName(primaryName)
	if err != nil {
		return model.StorageBackend{}, fmt.Errorf("unknown primary storage backend %q", primaryName)
	}
	if !primary.Enabled {
		return model.StorageBackend{}, fmt.Errorf("storage backend %q is disabled", primary.Name)
	}
	return primary, nil
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

func UploadFile(ctx context.Context, bucket model.Bucket, file model.File, body io.Reader, primaryName string) (model.File, error) {
	primary, err := ResolveUploadBackend(bucket, primaryName)
	if err != nil {
		return model.File{}, err
	}
	backend, err := storage.GetBackend(primary.Name)
	if err != nil {
		return model.File{}, err
	}

	file.ID = ulid.Make().Prefixed("file")
	file.BucketID = bucket.ID
	file.BucketName = bucket.Name
	file.StorageBackend = primary.Name
	file.StorageKey = bucket.Name + "/" + file.ID
	file.Status = model.FileStatusActive

	counter := &countingReader{reader: body}
	if err := backend.Put(ctx, file.StorageKey, counter, file.ContentType); err != nil {
		return model.File{}, fmt.Errorf("failed to write file to storage: %w", err)
	}
	file.SizeBytes = counter.count

	if err := database.DB.Create(&file).Error; err != nil {
		if deleteErr := backend.Delete(ctx, file.StorageKey); deleteErr != nil {
			return model.File{}, fmt.Errorf("failed to save file metadata: %w (orphaned object %s: %v)", err, file.StorageKey, deleteErr)
		}
		return model.File{}, fmt.Errorf("failed to save file metadata: %w", err)
	}

	return file, nil
}

func InitiateUpload(ctx context.Context, bucket model.Bucket, file model.File, primaryName string) (model.File, storage.PresignedRequest, error) {
	primary, err := ResolveUploadBackend(bucket, primaryName)
	if err != nil {
		return model.File{}, storage.PresignedRequest{}, err
	}
	backend, err := storage.GetBackend(primary.Name)
	if err != nil {
		return model.File{}, storage.PresignedRequest{}, err
	}

	file.ID = ulid.Make().Prefixed("file")
	file.BucketID = bucket.ID
	file.BucketName = bucket.Name
	file.StorageBackend = primary.Name
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
	if file.ContentType == "" {
		file.ContentType = info.ContentType
	}
	file.Status = model.FileStatusActive
	if err := database.DB.Save(&file).Error; err != nil {
		return model.File{}, err
	}
	return file, nil
}

func OpenFile(ctx context.Context, file model.File) (io.ReadCloser, error) {
	backend, err := storage.GetBackend(file.StorageBackend)
	if err != nil {
		return nil, err
	}
	body, err := backend.Get(ctx, file.StorageKey)
	if err != nil {
		return nil, fmt.Errorf("failed to open file from storage: %w", err)
	}
	return body, nil
}

func PresignDownload(ctx context.Context, file model.File) (storage.PresignedRequest, error) {
	backend, err := storage.GetBackend(file.StorageBackend)
	if err != nil {
		return storage.PresignedRequest{}, err
	}
	return backend.PresignGet(ctx, file.StorageKey, file.DownloadName(), expiryDuration())
}
