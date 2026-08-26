package model

import "time"

type BucketAccess string

const (
	BucketAccessRead  BucketAccess = "READ"
	BucketAccessWrite BucketAccess = "WRITE"
)

func (a BucketAccess) Valid() bool {
	return a == BucketAccessRead || a == BucketAccessWrite
}

// AllowsRead reports whether the access level permits reads. WRITE implies
// READ — an application that can upload can always read back what it wrote.
func (a BucketAccess) AllowsRead() bool {
	return a == BucketAccessRead || a == BucketAccessWrite
}

// BucketGrant authorizes one application (by Sentinel client_id) against one
// bucket. Grants are the only path a non-first-party token has to a bucket's
// files: Bucket.AccessGroupNames gates humans signed in through Depot's own
// OAuth client, grants gate everything else.
type BucketGrant struct {
	ID                string       `json:"id" gorm:"primaryKey"`
	BucketID          string       `json:"bucket_id" gorm:"index;uniqueIndex:idx_depot_bucket_grant_bucket_client"`
	BucketName        string       `json:"bucket_name" gorm:"index"`
	ClientID          string       `json:"client_id" gorm:"index;uniqueIndex:idx_depot_bucket_grant_bucket_client"`
	Description       string       `json:"description"`
	Access            BucketAccess `json:"access"`
	CreatedByEntityID string       `json:"created_by_entity_id" gorm:"index"`
	UpdatedByEntityID string       `json:"updated_by_entity_id" gorm:"index"`
	CreatedAt         time.Time    `json:"created_at" gorm:"autoCreateTime"`
	UpdatedAt         time.Time    `json:"updated_at" gorm:"autoUpdateTime"`
}

func (BucketGrant) TableName() string {
	return "depot_bucket_grant"
}
