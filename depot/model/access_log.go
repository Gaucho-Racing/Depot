package model

import "time"

type AccessAction string

const (
	AccessActionUpload          AccessAction = "UPLOAD"
	AccessActionPresignUpload   AccessAction = "PRESIGN_UPLOAD"
	AccessActionDownload        AccessAction = "DOWNLOAD"
	AccessActionPresignDownload AccessAction = "PRESIGN_DOWNLOAD"
	AccessActionDelete          AccessAction = "DELETE"
)

type AccessLog struct {
	ID         string       `json:"id" gorm:"primaryKey"`
	FileID     string       `json:"file_id" gorm:"index"`
	FileName   string       `json:"file_name"`
	BucketID   string       `json:"bucket_id" gorm:"index"`
	BucketName string       `json:"bucket_name" gorm:"index"`
	Action     AccessAction `json:"action" gorm:"index"`
	EntityID   string       `json:"entity_id" gorm:"index"`
	Public     bool         `json:"public"`
	CreatedAt  time.Time    `json:"created_at" gorm:"autoCreateTime;index"`
}

func (AccessLog) TableName() string {
	return "depot_access_log"
}
