package model

import (
	"mime"
	"path/filepath"
	"strings"
	"time"
)

type FileStatus string

const (
	FileStatusPending FileStatus = "PENDING"
	FileStatusActive  FileStatus = "ACTIVE"
)

type File struct {
	ID         string `json:"id" gorm:"primaryKey"`
	BucketID   string `json:"bucket_id" gorm:"index"`
	BucketName string `json:"bucket_name" gorm:"index"`
	// OriginalName is the filename the uploader reported, kept for reference and
	// search only. The file's identity is its ID.
	OriginalName      string            `json:"original_name" gorm:"index"`
	Path              string            `json:"path" gorm:"index"`
	ContentType       string            `json:"content_type"`
	SizeBytes         int64             `json:"size_bytes"`
	Status            FileStatus        `json:"status" gorm:"index"`
	Public            bool              `json:"public"`
	Tags              map[string]string `json:"tags" gorm:"type:jsonb;serializer:json"`
	StorageBackend    string            `json:"storage_backend" gorm:"index"`
	StorageKey        string            `json:"-"`
	CreatedByEntityID string            `json:"created_by_entity_id" gorm:"index"`
	CreatedByClientID string            `json:"created_by_client_id" gorm:"index"`
	UpdatedByEntityID string            `json:"updated_by_entity_id" gorm:"index"`
	UpdatedByClientID string            `json:"updated_by_client_id" gorm:"index"`
	CreatedAt         time.Time         `json:"created_at" gorm:"autoCreateTime"`
	UpdatedAt         time.Time         `json:"updated_at" gorm:"autoUpdateTime"`
}

func (File) TableName() string {
	return "depot_file"
}

// safeExtension keeps only the characters an extension can plausibly contain.
// The value derives from an uploader-supplied filename and ends up in a
// Content-Disposition header, so anything else — quotes, CRLF, path separators
// — is dropped rather than escaped.
func safeExtension(ext string) string {
	if len(ext) < 2 || ext[0] != '.' || len(ext) > 12 {
		return ""
	}
	for _, r := range ext[1:] {
		switch {
		case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z', r >= '0' && r <= '9':
		default:
			return ""
		}
	}
	return strings.ToLower(ext)
}

// contentTypeExtensions is the extension to use for a file whose reported name
// carries none. Curated rather than taken from mime.ExtensionsByType, whose
// tables are alphabetical and would yield .pjpeg for a JPEG, .mpg4 for an MP4
// and .mpga for an MP3.
var contentTypeExtensions = map[string]string{
	"image/png":        ".png",
	"image/jpeg":       ".jpg",
	"image/gif":        ".gif",
	"image/webp":       ".webp",
	"image/avif":       ".avif",
	"image/svg+xml":    ".svg",
	"video/mp4":        ".mp4",
	"video/quicktime":  ".mov",
	"video/webm":       ".webm",
	"audio/mpeg":       ".mp3",
	"audio/wav":        ".wav",
	"audio/ogg":        ".ogg",
	"text/plain":       ".txt",
	"text/csv":         ".csv",
	"text/html":        ".html",
	"application/json": ".json",
	"application/pdf":  ".pdf",
	"application/zip":  ".zip",
	"application/gzip": ".gz",
}

// extensionForContentType resolves a content type to an extension, preferring
// the curated table and otherwise accepting mime's answer only when it is
// unambiguous. application/octet-stream deliberately resolves to nothing.
func extensionForContentType(contentType string) string {
	base, _, err := mime.ParseMediaType(contentType)
	if err != nil {
		base = strings.ToLower(strings.TrimSpace(contentType))
	}
	if ext, ok := contentTypeExtensions[base]; ok {
		return ext
	}
	if candidates, err := mime.ExtensionsByType(base); err == nil && len(candidates) == 1 {
		return safeExtension(candidates[0])
	}
	return ""
}

// DownloadName is what a download should land as: the file ID, which is the
// file's real identity, plus an extension so the saved file still opens in the
// right application. The extension comes from the reported name when it has
// one, and from the content type otherwise.
func (f File) DownloadName() string {
	if ext := safeExtension(filepath.Ext(f.OriginalName)); ext != "" {
		return f.ID + ext
	}
	return f.ID + extensionForContentType(f.ContentType)
}
