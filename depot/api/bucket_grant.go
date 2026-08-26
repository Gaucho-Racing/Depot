package api

import (
	"errors"
	"net/http"
	"strings"

	"github.com/gaucho-racing/depot/depot/model"
	"github.com/gaucho-racing/depot/depot/service"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type bucketGrantRequest struct {
	ClientID    string             `json:"client_id"`
	Description string             `json:"description"`
	Access      model.BucketAccess `json:"access"`
}

func findBucketGrant(c *gin.Context, bucket model.Bucket) (model.BucketGrant, bool) {
	grant, err := service.GetBucketGrant(bucket.ID, c.Param("clientID"))
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "grant not found"})
			return model.BucketGrant{}, false
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return model.BucketGrant{}, false
	}
	return grant, true
}

func ListBucketGrants(c *gin.Context) {
	Require(c, RequestTokenExists(c))

	bucket, ok := findBucket(c)
	if !ok {
		return
	}

	grants, err := service.ListBucketGrants(bucket.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, grants)
}

func CreateBucketGrant(c *gin.Context) {
	Require(c, RequestTokenIsAdmin(c))

	bucket, ok := findBucket(c)
	if !ok {
		return
	}

	var req bucketGrantRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	clientID := strings.TrimSpace(req.ClientID)
	if clientID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "client_id is required"})
		return
	}
	if !req.Access.Valid() {
		c.JSON(http.StatusBadRequest, gin.H{"error": "access must be READ or WRITE"})
		return
	}

	grant, err := service.CreateBucketGrant(model.BucketGrant{
		BucketID:          bucket.ID,
		BucketName:        bucket.Name,
		ClientID:          clientID,
		Description:       req.Description,
		Access:            req.Access,
		CreatedByEntityID: GetRequestTokenEntityID(c),
		UpdatedByEntityID: GetRequestTokenEntityID(c),
	})
	if err != nil {
		if errors.Is(err, gorm.ErrDuplicatedKey) {
			c.JSON(http.StatusConflict, gin.H{"error": "this application already has a grant on this bucket"})
			return
		}
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, grant)
}

func UpdateBucketGrant(c *gin.Context) {
	Require(c, RequestTokenIsAdmin(c))

	bucket, ok := findBucket(c)
	if !ok {
		return
	}

	grant, ok := findBucketGrant(c, bucket)
	if !ok {
		return
	}

	var req bucketGrantRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if !req.Access.Valid() {
		c.JSON(http.StatusBadRequest, gin.H{"error": "access must be READ or WRITE"})
		return
	}
	grant.Access = req.Access
	grant.Description = req.Description
	grant.UpdatedByEntityID = GetRequestTokenEntityID(c)

	updated, err := service.UpdateBucketGrant(grant)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, updated)
}

func DeleteBucketGrant(c *gin.Context) {
	Require(c, RequestTokenIsAdmin(c))

	bucket, ok := findBucket(c)
	if !ok {
		return
	}

	grant, ok := findBucketGrant(c, bucket)
	if !ok {
		return
	}
	if err := service.DeleteBucketGrant(grant); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "grant revoked"})
}
