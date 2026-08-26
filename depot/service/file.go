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
	"github.com/gaucho-racing/depot/depot/pkg/logger"
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
	return AttachReplicas(file), nil
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
	return attachReplicasBatch(files), nil
}

func AttachReplicas(file model.File) model.File {
	replicas := []model.FileReplica{}
	database.DB.Where("file_id = ?", file.ID).Order("created_at asc").Find(&replicas)
	file.Replicas = replicas
	return file
}

func attachReplicasBatch(files []model.File) []model.File {
	if len(files) == 0 {
		return files
	}
	ids := make([]string, 0, len(files))
	for _, file := range files {
		ids = append(ids, file.ID)
	}
	replicas := []model.FileReplica{}
	database.DB.Where("file_id IN ?", ids).Order("created_at asc").Find(&replicas)
	byFile := map[string][]model.FileReplica{}
	for _, replica := range replicas {
		byFile[replica.FileID] = append(byFile[replica.FileID], replica)
	}
	for i := range files {
		files[i].Replicas = byFile[files[i].ID]
		if files[i].Replicas == nil {
			files[i].Replicas = []model.FileReplica{}
		}
	}
	return files
}

// ResolveUploadBackends validates the requested primary + replica storage
// backend names, falling back to the default backend when no primary is named.
func ResolveUploadBackends(primaryName string, replicaNames []string) (model.StorageBackend, []model.StorageBackend, error) {
	var primary model.StorageBackend
	var err error
	if primaryName == "" {
		primary, err = DefaultStorageBackend()
		if err != nil {
			return model.StorageBackend{}, nil, err
		}
	} else {
		primary, err = GetStorageBackendByName(primaryName)
		if err != nil {
			return model.StorageBackend{}, nil, fmt.Errorf("unknown storage backend %q", primaryName)
		}
	}
	if !primary.Enabled {
		return model.StorageBackend{}, nil, fmt.Errorf("storage backend %q is disabled", primary.Name)
	}

	seen := map[string]bool{primary.Name: true}
	replicas := []model.StorageBackend{}
	for _, name := range replicaNames {
		if name == "" || seen[name] {
			continue
		}
		backend, err := GetStorageBackendByName(name)
		if err != nil {
			return model.StorageBackend{}, nil, fmt.Errorf("unknown replica storage backend %q", name)
		}
		if !backend.Enabled {
			return model.StorageBackend{}, nil, fmt.Errorf("replica storage backend %q is disabled", backend.Name)
		}
		seen[name] = true
		replicas = append(replicas, backend)
	}
	return primary, replicas, nil
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

func UploadFile(ctx context.Context, bucket model.Bucket, file model.File, body io.Reader, primaryName string, replicaNames []string) (model.File, error) {
	primary, replicaBackends, err := ResolveUploadBackends(primaryName, replicaNames)
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

	file.Replicas = createReplicaRows(file, replicaBackends)
	go ReplicateFile(file)
	return file, nil
}

func InitiateUpload(ctx context.Context, bucket model.Bucket, file model.File, primaryName string, replicaNames []string) (model.File, storage.PresignedRequest, error) {
	primary, replicaBackends, err := ResolveUploadBackends(primaryName, replicaNames)
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
	file.Replicas = createReplicaRows(file, replicaBackends)
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
	file = AttachReplicas(file)
	go ReplicateFile(file)
	return file, nil
}

func createReplicaRows(file model.File, backends []model.StorageBackend) []model.FileReplica {
	replicas := make([]model.FileReplica, 0, len(backends))
	for _, backend := range backends {
		replica := model.FileReplica{
			ID:             ulid.Make().Prefixed("repl"),
			FileID:         file.ID,
			StorageBackend: backend.Name,
			StorageKey:     file.StorageKey,
			Status:         model.ReplicaStatusPending,
		}
		if err := database.DB.Create(&replica).Error; err != nil {
			logger.SugarLogger.Errorf("failed to create replica row for file %s → %s: %v", file.ID, backend.Name, err)
			continue
		}
		replicas = append(replicas, replica)
	}
	return replicas
}

// ReplicateFile copies an ACTIVE file's object from its primary terminal to
// every PENDING/FAILED replica, updating replica status as it goes. Runs in
// the background after uploads; safe to re-run.
func ReplicateFile(file model.File) {
	if file.Status != model.FileStatusActive {
		return
	}
	replicas := []model.FileReplica{}
	if err := database.DB.Where("file_id = ? AND status != ?", file.ID, model.ReplicaStatusActive).Find(&replicas).Error; err != nil {
		logger.SugarLogger.Errorf("failed to load replicas for file %s: %v", file.ID, err)
		return
	}
	if len(replicas) == 0 {
		return
	}

	ctx := context.Background()
	source, err := storage.GetBackend(file.StorageBackend)
	if err != nil {
		logger.SugarLogger.Errorf("replication skipped for file %s: %v", file.ID, err)
		return
	}

	for _, replica := range replicas {
		target, err := storage.GetBackend(replica.StorageBackend)
		if err != nil {
			markReplica(replica, model.ReplicaStatusFailed, err.Error())
			continue
		}
		body, err := source.Get(ctx, file.StorageKey)
		if err != nil {
			markReplica(replica, model.ReplicaStatusFailed, fmt.Sprintf("read from primary: %v", err))
			continue
		}
		err = target.Put(ctx, replica.StorageKey, body, file.ContentType)
		body.Close()
		if err != nil {
			markReplica(replica, model.ReplicaStatusFailed, fmt.Sprintf("write to replica: %v", err))
			continue
		}
		if _, err := target.Stat(ctx, replica.StorageKey); err != nil {
			markReplica(replica, model.ReplicaStatusFailed, fmt.Sprintf("verify replica: %v", err))
			continue
		}
		markReplica(replica, model.ReplicaStatusActive, "")
		logger.SugarLogger.Infof("Replicated file %s → storage backend %s", file.ID, replica.StorageBackend)
	}
}

func markReplica(replica model.FileReplica, status model.ReplicaStatus, errMessage string) {
	replica.Status = status
	replica.Error = errMessage
	if err := database.DB.Save(&replica).Error; err != nil {
		logger.SugarLogger.Errorf("failed to update replica %s: %v", replica.ID, err)
	}
	if status == model.ReplicaStatusFailed {
		logger.SugarLogger.Errorf("Replication failed for file %s → storage backend %s: %s", replica.FileID, replica.StorageBackend, errMessage)
	}
}

// RetryStalledReplicas periodically re-drives replicas that are PENDING or
// FAILED (e.g. after a crash mid-replication or a terminal outage).
func RetryStalledReplicas() {
	sweep := func() {
		stalled := []model.FileReplica{}
		cutoff := time.Now().Add(-5 * time.Minute)
		if err := database.DB.Where("status != ? AND updated_at < ?", model.ReplicaStatusActive, cutoff).Find(&stalled).Error; err != nil {
			return
		}
		seen := map[string]bool{}
		for _, replica := range stalled {
			if seen[replica.FileID] {
				continue
			}
			seen[replica.FileID] = true
			var file model.File
			if err := database.DB.Where("id = ?", replica.FileID).First(&file).Error; err != nil {
				continue
			}
			ReplicateFile(file)
		}
	}

	sweep()
	ticker := time.NewTicker(10 * time.Minute)
	for range ticker.C {
		sweep()
	}
}

func activeReplicas(file model.File) []model.FileReplica {
	replicas := []model.FileReplica{}
	database.DB.Where("file_id = ? AND status = ?", file.ID, model.ReplicaStatusActive).Order("created_at asc").Find(&replicas)
	return replicas
}

func OpenFile(ctx context.Context, file model.File) (io.ReadCloser, error) {
	backend, err := storage.GetBackend(file.StorageBackend)
	if err == nil {
		body, openErr := backend.Get(ctx, file.StorageKey)
		if openErr == nil {
			return body, nil
		}
		err = openErr
	}

	for _, replica := range activeReplicas(file) {
		target, targetErr := storage.GetBackend(replica.StorageBackend)
		if targetErr != nil {
			continue
		}
		body, openErr := target.Get(ctx, replica.StorageKey)
		if openErr == nil {
			logger.SugarLogger.Warnf("Serving file %s from replica backend %s (primary %s failed: %v)", file.ID, replica.StorageBackend, file.StorageBackend, err)
			return body, nil
		}
	}
	return nil, fmt.Errorf("failed to open file from primary or replicas: %w", err)
}

func PresignDownload(ctx context.Context, file model.File) (storage.PresignedRequest, error) {
	backend, err := storage.GetBackend(file.StorageBackend)
	if err == nil {
		return backend.PresignGet(ctx, file.StorageKey, expiryDuration())
	}

	for _, replica := range activeReplicas(file) {
		target, targetErr := storage.GetBackend(replica.StorageBackend)
		if targetErr != nil {
			continue
		}
		logger.SugarLogger.Warnf("Presigning file %s from replica backend %s (primary %s unavailable)", file.ID, replica.StorageBackend, file.StorageBackend)
		return target.PresignGet(ctx, replica.StorageKey, expiryDuration())
	}
	return storage.PresignedRequest{}, err
}
