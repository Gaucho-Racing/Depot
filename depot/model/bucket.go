package model

import "time"

type Bucket struct {
	ID               string `json:"id" gorm:"primaryKey"`
	Name             string `json:"name" gorm:"uniqueIndex"`
	Description      string `json:"description"`
	AllowPublicFiles bool   `json:"allow_public_files"`
	// AllowAuthenticatedRead opens reads to any valid Sentinel token, whoever
	// it belongs to. Writes still require a WRITE grant.
	AllowAuthenticatedRead bool      `json:"allow_authenticated_read"`
	CreatedByEntityID      string    `json:"created_by_entity_id" gorm:"index"`
	UpdatedByEntityID      string    `json:"updated_by_entity_id" gorm:"index"`
	CreatedAt              time.Time `json:"created_at" gorm:"autoCreateTime"`
	UpdatedAt              time.Time `json:"updated_at" gorm:"autoUpdateTime"`
}

func (Bucket) TableName() string {
	return "depot_bucket"
}
