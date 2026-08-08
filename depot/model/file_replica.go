package model

import "time"

type ReplicaStatus string

const (
	ReplicaStatusPending ReplicaStatus = "PENDING"
	ReplicaStatusActive  ReplicaStatus = "ACTIVE"
	ReplicaStatusFailed  ReplicaStatus = "FAILED"
)

type FileReplica struct {
	ID             string        `json:"id" gorm:"primaryKey"`
	FileID         string        `json:"file_id" gorm:"index"`
	StorageBackend string        `json:"storage_backend" gorm:"index;column:storage_backend"`
	StorageKey     string        `json:"-"`
	Status         ReplicaStatus `json:"status" gorm:"index"`
	Error          string        `json:"error,omitempty"`
	CreatedAt      time.Time     `json:"created_at" gorm:"autoCreateTime"`
	UpdatedAt      time.Time     `json:"updated_at" gorm:"autoUpdateTime"`
}

func (FileReplica) TableName() string {
	return "depot_file_replica"
}
