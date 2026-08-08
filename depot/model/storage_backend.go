package model

import "time"

type StorageProvider string

const (
	StorageProviderAWSS3        StorageProvider = "aws-s3"
	StorageProviderS3Compatible StorageProvider = "s3-compatible"
)

// ProviderRegionCatalog maps each supported provider to its known regions.
// The lists drive UI pickers; every provider also accepts a custom region
// value (AllowsCustom), since region nomenclature is provider-defined and
// new regions ship faster than this list updates.
type ProviderRegions struct {
	Provider       StorageProvider `json:"provider"`
	Regions        []string        `json:"regions"`
	AllowsCustom   bool            `json:"allows_custom"`
	RegionRequired bool            `json:"region_required"`
}

var ProviderRegionCatalog = []ProviderRegions{
	{
		Provider:       StorageProviderAWSS3,
		AllowsCustom:   true,
		RegionRequired: true,
		Regions: []string{
			"us-east-1", "us-east-2", "us-west-1", "us-west-2",
			"ca-central-1", "ca-west-1",
			"sa-east-1",
			"eu-west-1", "eu-west-2", "eu-west-3",
			"eu-central-1", "eu-central-2",
			"eu-north-1", "eu-south-1", "eu-south-2",
			"ap-south-1", "ap-south-2",
			"ap-northeast-1", "ap-northeast-2", "ap-northeast-3",
			"ap-southeast-1", "ap-southeast-2", "ap-southeast-3", "ap-southeast-4", "ap-southeast-5",
			"ap-east-1",
			"af-south-1",
			"me-south-1", "me-central-1",
			"il-central-1",
		},
	},
	{
		Provider:       StorageProviderS3Compatible,
		AllowsCustom:   true,
		RegionRequired: false,
		// R2 location hints; MinIO and friends take anything (or nothing).
		Regions: []string{"auto", "wnam", "enam", "weur", "eeur", "apac"},
	},
}

func CatalogForProvider(provider StorageProvider) (ProviderRegions, bool) {
	for _, entry := range ProviderRegionCatalog {
		if entry.Provider == provider {
			return entry, true
		}
	}
	return ProviderRegions{}, false
}

type StorageBackend struct {
	ID                string          `json:"id" gorm:"primaryKey"`
	Name              string          `json:"name" gorm:"uniqueIndex"`
	Provider          StorageProvider `json:"provider"`
	Region            string          `json:"region"`
	Bucket            string          `json:"bucket"`
	Endpoint          string          `json:"endpoint"`
	ForcePathStyle    bool            `json:"force_path_style"`
	AccessKeyID       string          `json:"-"`
	SecretAccessKey   string          `json:"-"`
	Default           bool            `json:"default" gorm:"index"`
	Enabled           bool            `json:"enabled"`
	CreatedByEntityID string          `json:"created_by_entity_id" gorm:"index"`
	UpdatedByEntityID string          `json:"updated_by_entity_id" gorm:"index"`
	CreatedAt         time.Time       `json:"created_at" gorm:"autoCreateTime"`
	UpdatedAt         time.Time       `json:"updated_at" gorm:"autoUpdateTime"`
}

func (StorageBackend) TableName() string {
	return "depot_storage_backend"
}
