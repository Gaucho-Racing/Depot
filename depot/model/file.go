package model

import "time"

type FileStatus string

const (
	FileStatusPending FileStatus = "PENDING"
	FileStatusActive  FileStatus = "ACTIVE"
)

type File struct {
	ID                string            `json:"id" gorm:"primaryKey"`
	BucketID          string            `json:"bucket_id" gorm:"index"`
	BucketName        string            `json:"bucket_name" gorm:"index"`
	Name              string            `json:"name" gorm:"index"`
	Path              string            `json:"path" gorm:"index"`
	ContentType       string            `json:"content_type"`
	SizeBytes         int64             `json:"size_bytes"`
	Checksum          string            `json:"checksum"`
	Status            FileStatus        `json:"status" gorm:"index"`
	Public            bool              `json:"public"`
	Tags              map[string]string `json:"tags" gorm:"type:jsonb;serializer:json"`
	StorageBackend    string            `json:"-" gorm:"index"`
	StorageKey        string            `json:"-"`
	CreatedByEntityID string            `json:"created_by_entity_id" gorm:"index"`
	UpdatedByEntityID string            `json:"updated_by_entity_id" gorm:"index"`
	CreatedAt         time.Time         `json:"created_at" gorm:"autoCreateTime"`
	UpdatedAt         time.Time         `json:"updated_at" gorm:"autoUpdateTime"`
}

func (File) TableName() string {
	return "depot_file"
}
