package model

import "time"

type TerminalProvider string

const (
	TerminalProviderAWSS3        TerminalProvider = "aws-s3"
	TerminalProviderS3Compatible TerminalProvider = "s3-compatible"
)

type Terminal struct {
	ID              string           `json:"id" gorm:"primaryKey"`
	Name            string           `json:"name" gorm:"uniqueIndex"`
	Provider        TerminalProvider `json:"provider"`
	Region          string           `json:"region"`
	Bucket          string           `json:"bucket"`
	Endpoint        string           `json:"endpoint"`
	ForcePathStyle  bool             `json:"force_path_style"`
	AccessKeyID     string           `json:"-"`
	SecretAccessKey string           `json:"-"`
	Default         bool             `json:"default" gorm:"index"`
	Enabled         bool             `json:"enabled"`
	CreatedAt       time.Time        `json:"created_at" gorm:"autoCreateTime"`
	UpdatedAt       time.Time        `json:"updated_at" gorm:"autoUpdateTime"`
}

func (Terminal) TableName() string {
	return "depot_terminal"
}
