package model

import "time"

type DownloadToken struct {
	ID        string    `json:"id" gorm:"primaryKey"`
	FileID    string    `json:"file_id" gorm:"index"`
	EntityID  string    `json:"entity_id" gorm:"index"`
	ClientID  string    `json:"client_id" gorm:"index"`
	ActorType ActorType `json:"actor_type" gorm:"index"`
	ExpiresAt time.Time `json:"expires_at" gorm:"index"`
	CreatedAt time.Time `json:"created_at" gorm:"autoCreateTime"`
}

func (DownloadToken) TableName() string {
	return "depot_download_token"
}
