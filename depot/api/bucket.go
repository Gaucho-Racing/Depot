package api

import (
	"errors"
	"net/http"

	"github.com/gaucho-racing/depot/depot/model"
	"github.com/gaucho-racing/depot/depot/service"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type bucketRequest struct {
	Name                    string  `json:"name"`
	Description             string  `json:"description"`
	PrimaryStorageBackend   *string `json:"primary_storage_backend"`
	AllowPublicFiles        bool    `json:"allow_public_files"`
	AllowAuthenticatedRead  bool    `json:"allow_authenticated_read"`
	AllowAuthenticatedWrite bool    `json:"allow_authenticated_write"`
}

func ListBuckets(c *gin.Context) {
	Require(c, RequestTokenExists(c))

	buckets, err := service.GetAllBuckets()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if RequestTokenIsAdmin(c) {
		c.JSON(http.StatusOK, buckets)
		return
	}
	accessible := []model.Bucket{}
	for _, bucket := range buckets {
		if RequestTokenCanReadBucket(c, bucket) {
			accessible = append(accessible, bucket)
		}
	}
	c.JSON(http.StatusOK, accessible)
}

func CreateBucket(c *gin.Context) {
	Require(c, RequestTokenIsAdmin(c))

	var req bucketRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.Name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "name is required"})
		return
	}
	if req.PrimaryStorageBackend == nil || *req.PrimaryStorageBackend == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "primary_storage_backend is required"})
		return
	}

	bucket := model.Bucket{
		Name:                    req.Name,
		Description:             req.Description,
		PrimaryStorageBackend:   *req.PrimaryStorageBackend,
		AllowPublicFiles:        req.AllowPublicFiles,
		AllowAuthenticatedRead:  req.AllowAuthenticatedRead,
		AllowAuthenticatedWrite: req.AllowAuthenticatedWrite,
		CreatedByEntityID:       GetRequestTokenEntityID(c),
		UpdatedByEntityID:       GetRequestTokenEntityID(c),
	}
	created, err := service.CreateBucket(bucket)
	if err != nil {
		if errors.Is(err, gorm.ErrDuplicatedKey) {
			c.JSON(http.StatusConflict, gin.H{"error": "a bucket with this name already exists"})
			return
		}
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, created)
}

func GetBucket(c *gin.Context) {
	bucket, err := service.GetBucketByName(c.Param("bucketName"))
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "bucket not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	Require(c, RequestTokenCanReadBucket(c, bucket))
	c.JSON(http.StatusOK, bucket)
}

func UpdateBucket(c *gin.Context) {
	Require(c, RequestTokenIsAdmin(c))

	bucket, err := service.GetBucketByName(c.Param("bucketName"))
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "bucket not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	var req bucketRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.PrimaryStorageBackend != nil && *req.PrimaryStorageBackend != bucket.PrimaryStorageBackend {
		c.JSON(http.StatusBadRequest, gin.H{"error": "primary storage backends are immutable"})
		return
	}
	bucket.Description = req.Description
	bucket.AllowPublicFiles = req.AllowPublicFiles
	bucket.AllowAuthenticatedRead = req.AllowAuthenticatedRead
	bucket.AllowAuthenticatedWrite = req.AllowAuthenticatedWrite
	bucket.UpdatedByEntityID = GetRequestTokenEntityID(c)

	updated, err := service.UpdateBucket(bucket)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, updated)
}

func DeleteBucket(c *gin.Context) {
	Require(c, RequestTokenIsAdmin(c))

	bucket, err := service.GetBucketByName(c.Param("bucketName"))
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "bucket not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if err := service.DeleteBucket(bucket); err != nil {
		c.JSON(http.StatusConflict, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "bucket deleted"})
}
