package service

import (
	"fmt"

	"github.com/gaucho-racing/depot/depot/database"
	"github.com/gaucho-racing/depot/depot/model"
	ulid "github.com/gaucho-racing/ulid-go"
)

func ListBucketGrants(bucketID string) ([]model.BucketGrant, error) {
	grants := []model.BucketGrant{}
	if err := database.DB.Where("bucket_id = ?", bucketID).Order("created_at asc").Find(&grants).Error; err != nil {
		return nil, err
	}
	return grants, nil
}

func ListGrantsForClient(clientID string) ([]model.BucketGrant, error) {
	grants := []model.BucketGrant{}
	if err := database.DB.Where("client_id = ?", clientID).Order("bucket_name asc").Find(&grants).Error; err != nil {
		return nil, err
	}
	return grants, nil
}

func GetBucketGrant(bucketID string, clientID string) (model.BucketGrant, error) {
	var grant model.BucketGrant
	if err := database.DB.Where("bucket_id = ? AND client_id = ?", bucketID, clientID).First(&grant).Error; err != nil {
		return model.BucketGrant{}, err
	}
	return grant, nil
}

// ClientCanReadBucket and ClientCanWriteBucket are the authorization
// primitives for non-first-party tokens. Absence of a grant is a denial —
// applications have no implicit access to any bucket.
func ClientCanReadBucket(bucketID string, clientID string) bool {
	if clientID == "" {
		return false
	}
	grant, err := GetBucketGrant(bucketID, clientID)
	if err != nil {
		return false
	}
	return grant.Access.AllowsRead()
}

func ClientCanWriteBucket(bucketID string, clientID string) bool {
	if clientID == "" {
		return false
	}
	grant, err := GetBucketGrant(bucketID, clientID)
	if err != nil {
		return false
	}
	return grant.Access == model.BucketAccessWrite
}

func CreateBucketGrant(grant model.BucketGrant) (model.BucketGrant, error) {
	if grant.ClientID == "" {
		return model.BucketGrant{}, fmt.Errorf("client_id is required")
	}
	if !grant.Access.Valid() {
		return model.BucketGrant{}, fmt.Errorf("access must be READ or WRITE")
	}
	grant.ID = ulid.Make().Prefixed("bg")
	if err := database.DB.Create(&grant).Error; err != nil {
		return model.BucketGrant{}, err
	}
	return grant, nil
}

func UpdateBucketGrant(grant model.BucketGrant) (model.BucketGrant, error) {
	if !grant.Access.Valid() {
		return model.BucketGrant{}, fmt.Errorf("access must be READ or WRITE")
	}
	if err := database.DB.Save(&grant).Error; err != nil {
		return model.BucketGrant{}, err
	}
	return grant, nil
}

func DeleteBucketGrant(grant model.BucketGrant) error {
	return database.DB.Delete(&grant).Error
}

// DeleteGrantsForBucket clears a bucket's grants when the bucket itself is
// removed. Buckets can only be deleted while empty, so no files are orphaned.
func DeleteGrantsForBucket(bucketID string) error {
	return database.DB.Where("bucket_id = ?", bucketID).Delete(&model.BucketGrant{}).Error
}
