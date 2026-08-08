package api

import (
	"context"
	"errors"
	"net/http"

	"github.com/gaucho-racing/depot/depot/model"
	"github.com/gaucho-racing/depot/depot/service"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

func ListStorageBackends(c *gin.Context) {
	Require(c, RequestTokenExists(c))

	backends, err := service.ListStorageBackends()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, backends)
}

func ListStorageProviders(c *gin.Context) {
	Require(c, RequestTokenExists(c))
	c.JSON(http.StatusOK, model.ProviderRegionCatalog)
}

type storageBackendRequest struct {
	Name            *string `json:"name"`
	Provider        *string `json:"provider"`
	Region          *string `json:"region"`
	Bucket          *string `json:"bucket"`
	Endpoint        *string `json:"endpoint"`
	ForcePathStyle  *bool   `json:"force_path_style"`
	AccessKeyID     *string `json:"access_key_id"`
	SecretAccessKey *string `json:"secret_access_key"`
	Default         *bool   `json:"default"`
	Enabled         *bool   `json:"enabled"`
}

func CreateStorageBackend(c *gin.Context) {
	Require(c, RequestTokenIsAdmin(c))

	var req storageBackendRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.Name == nil || *req.Name == "" || req.Provider == nil || req.Bucket == nil || *req.Bucket == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "name, provider, and bucket are required"})
		return
	}

	backend := model.StorageBackend{
		Name:              *req.Name,
		Provider:          model.StorageProvider(*req.Provider),
		Bucket:            *req.Bucket,
		Enabled:           true,
		CreatedByEntityID: GetRequestTokenEntityID(c),
		UpdatedByEntityID: GetRequestTokenEntityID(c),
	}
	if req.Region != nil {
		backend.Region = *req.Region
	}
	if req.Endpoint != nil {
		backend.Endpoint = *req.Endpoint
	}
	if req.ForcePathStyle != nil {
		backend.ForcePathStyle = *req.ForcePathStyle
	}
	if req.AccessKeyID != nil {
		backend.AccessKeyID = *req.AccessKeyID
	}
	if req.SecretAccessKey != nil {
		backend.SecretAccessKey = *req.SecretAccessKey
	}
	if req.Default != nil {
		backend.Default = *req.Default
	}
	if req.Enabled != nil {
		backend.Enabled = *req.Enabled
	}

	if err := service.ValidateProviderRegion(backend.Provider, backend.Region); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	// Reject configs that can't even construct a client before persisting.
	if _, err := service.BuildBackendClient(context.Background(), backend); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	created, err := service.CreateStorageBackend(backend)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, created)
}

func findStorageBackend(c *gin.Context) (model.StorageBackend, bool) {
	backend, err := service.GetStorageBackendByName(c.Param("backendName"))
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "storage backend not found"})
			return model.StorageBackend{}, false
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return model.StorageBackend{}, false
	}
	return backend, true
}

func UpdateStorageBackend(c *gin.Context) {
	Require(c, RequestTokenIsAdmin(c))

	backend, ok := findStorageBackend(c)
	if !ok {
		return
	}

	var req storageBackendRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.Name != nil && *req.Name != backend.Name {
		c.JSON(http.StatusBadRequest, gin.H{"error": "storage backend names are immutable — files reference them"})
		return
	}
	if req.Provider != nil {
		backend.Provider = model.StorageProvider(*req.Provider)
	}
	if req.Region != nil {
		backend.Region = *req.Region
	}
	if req.Bucket != nil && *req.Bucket != "" {
		backend.Bucket = *req.Bucket
	}
	if req.Endpoint != nil {
		backend.Endpoint = *req.Endpoint
	}
	if req.ForcePathStyle != nil {
		backend.ForcePathStyle = *req.ForcePathStyle
	}
	if req.AccessKeyID != nil {
		backend.AccessKeyID = *req.AccessKeyID
	}
	if req.SecretAccessKey != nil {
		backend.SecretAccessKey = *req.SecretAccessKey
	}
	if req.Default != nil {
		backend.Default = *req.Default
	}
	if req.Enabled != nil {
		backend.Enabled = *req.Enabled
	}
	backend.UpdatedByEntityID = GetRequestTokenEntityID(c)

	if err := service.ValidateProviderRegion(backend.Provider, backend.Region); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if _, err := service.BuildBackendClient(context.Background(), backend); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	updated, err := service.UpdateStorageBackend(backend)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, updated)
}

func DeleteStorageBackend(c *gin.Context) {
	Require(c, RequestTokenIsAdmin(c))

	backend, ok := findStorageBackend(c)
	if !ok {
		return
	}
	if err := service.DeleteStorageBackend(backend); err != nil {
		c.JSON(http.StatusConflict, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "storage backend deleted"})
}
