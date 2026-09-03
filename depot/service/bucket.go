package service

import (
	"errors"
	"fmt"
	"regexp"

	"github.com/gaucho-racing/depot/depot/database"
	"github.com/gaucho-racing/depot/depot/model"
	ulid "github.com/gaucho-racing/ulid-go"
	"gorm.io/gorm"
)

var bucketNameRegex = regexp.MustCompile(`^[a-z0-9]([a-z0-9-]{1,61}[a-z0-9])?$`)

func ValidateBucketName(name string) error {
	if !bucketNameRegex.MatchString(name) {
		return fmt.Errorf("bucket name must be 3-63 characters of lowercase letters, numbers, and hyphens, and must start and end with a letter or number")
	}
	return nil
}

func GetAllBuckets() ([]model.Bucket, error) {
	buckets := []model.Bucket{}
	if err := database.DB.Order("name asc").Find(&buckets).Error; err != nil {
		return nil, err
	}
	return buckets, nil
}

func GetBucketByID(id string) (model.Bucket, error) {
	var bucket model.Bucket
	if err := database.DB.Where("id = ?", id).First(&bucket).Error; err != nil {
		return model.Bucket{}, err
	}
	return bucket, nil
}

func GetBucketByName(name string) (model.Bucket, error) {
	var bucket model.Bucket
	if err := database.DB.Where("name = ?", name).First(&bucket).Error; err != nil {
		return model.Bucket{}, err
	}
	return bucket, nil
}

func CreateBucket(bucket model.Bucket) (model.Bucket, error) {
	if err := ValidateBucketName(bucket.Name); err != nil {
		return model.Bucket{}, err
	}
	if bucket.AllowAuthenticatedWrite {
		bucket.AllowAuthenticatedRead = true
	}
	backend, err := GetStorageBackendByName(bucket.PrimaryStorageBackend)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return model.Bucket{}, fmt.Errorf("unknown primary storage backend %q", bucket.PrimaryStorageBackend)
		}
		return model.Bucket{}, err
	}
	if !backend.Enabled {
		return model.Bucket{}, fmt.Errorf("primary storage backend %q is disabled", backend.Name)
	}
	bucket.ID = ulid.Make().Prefixed("bkt")
	if err := database.DB.Create(&bucket).Error; err != nil {
		return model.Bucket{}, err
	}
	return bucket, nil
}

func UpdateBucket(bucket model.Bucket) (model.Bucket, error) {
	if bucket.AllowAuthenticatedWrite {
		bucket.AllowAuthenticatedRead = true
	}
	if err := database.DB.Model(&bucket).Select(
		"description",
		"allow_public_files",
		"allow_authenticated_read",
		"allow_authenticated_write",
		"updated_by_entity_id",
	).Updates(bucket).Error; err != nil {
		return model.Bucket{}, err
	}
	return GetBucketByID(bucket.ID)
}

func CountFilesInBucket(bucketID string) (int64, error) {
	var count int64
	if err := database.DB.Model(&model.File{}).Where("bucket_id = ?", bucketID).Count(&count).Error; err != nil {
		return 0, err
	}
	return count, nil
}

func DeleteBucket(bucket model.Bucket) error {
	count, err := CountFilesInBucket(bucket.ID)
	if err != nil {
		return err
	}
	if count > 0 {
		return fmt.Errorf("bucket contains %d files and cannot be deleted", count)
	}
	if err := DeleteGrantsForBucket(bucket.ID); err != nil {
		return err
	}
	return database.DB.Delete(&bucket).Error
}
