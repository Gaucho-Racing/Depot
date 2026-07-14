package api

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"

	"github.com/gaucho-racing/depot/depot/config"
	"github.com/gaucho-racing/depot/depot/model"
	"github.com/gaucho-racing/depot/depot/service"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

func findBucket(c *gin.Context) (model.Bucket, bool) {
	bucket, err := service.GetBucketByName(c.Param("bucketName"))
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "bucket not found"})
			return model.Bucket{}, false
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return model.Bucket{}, false
	}
	return bucket, true
}

func findFile(c *gin.Context, bucket model.Bucket) (model.File, bool) {
	file, err := service.GetFileByID(bucket.ID, c.Param("id"))
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "file not found"})
			return model.File{}, false
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return model.File{}, false
	}
	return file, true
}

func ListFiles(c *gin.Context) {
	Require(c, RequestTokenCanReadBucket(c, c.Param("bucketName")))

	bucket, ok := findBucket(c)
	if !ok {
		return
	}

	limit, err := strconv.Atoi(c.DefaultQuery("limit", "100"))
	if err != nil || limit < 1 || limit > 1000 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "limit must be an integer between 1 and 1000"})
		return
	}
	offset, err := strconv.Atoi(c.DefaultQuery("offset", "0"))
	if err != nil || offset < 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "offset must be a non-negative integer"})
		return
	}
	status := model.FileStatus(c.DefaultQuery("status", string(model.FileStatusActive)))

	files, err := service.ListFiles(bucket.ID, c.Query("path_prefix"), status, limit, offset)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, files)
}

func UploadFile(c *gin.Context) {
	Require(c, RequestTokenCanWriteBucket(c, c.Param("bucketName")))

	bucket, ok := findBucket(c)
	if !ok {
		return
	}

	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, config.MaxProxyUploadBytesLimit)
	formFile, err := c.FormFile("file")
	if err != nil {
		var maxBytesErr *http.MaxBytesError
		if errors.As(err, &maxBytesErr) {
			c.JSON(http.StatusRequestEntityTooLarge, gin.H{"error": fmt.Sprintf("file exceeds the %d byte proxy upload limit, use the presigned upload flow instead", config.MaxProxyUploadBytesLimit)})
			return
		}
		c.JSON(http.StatusBadRequest, gin.H{"error": "a file form field is required"})
		return
	}

	file := model.File{
		Name:              c.PostForm("name"),
		Path:              c.PostForm("path"),
		ContentType:       c.PostForm("content_type"),
		CreatedByEntityID: GetRequestTokenEntityID(c),
		UpdatedByEntityID: GetRequestTokenEntityID(c),
	}
	if file.Name == "" {
		file.Name = formFile.Filename
	}
	if file.Name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "name is required"})
		return
	}
	if file.ContentType == "" {
		file.ContentType = formFile.Header.Get("Content-Type")
	}
	if publicValue := c.PostForm("public"); publicValue != "" {
		public, err := strconv.ParseBool(publicValue)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "public must be a boolean"})
			return
		}
		file.Public = public
	}
	if tagsValue := c.PostForm("tags"); tagsValue != "" {
		if err := json.Unmarshal([]byte(tagsValue), &file.Tags); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "tags must be a JSON object of string keys and string values"})
			return
		}
	}

	body, err := formFile.Open()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer body.Close()

	created, err := service.UploadFile(c.Request.Context(), bucket, file, body)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, created)
}

func GetFile(c *gin.Context) {
	bucket, ok := findBucket(c)
	if !ok {
		return
	}
	file, ok := findFile(c, bucket)
	if !ok {
		return
	}
	Require(c, file.Public || RequestTokenCanReadBucket(c, bucket.Name))

	c.JSON(http.StatusOK, file)
}

func GetFileContent(c *gin.Context) {
	bucket, ok := findBucket(c)
	if !ok {
		return
	}
	file, ok := findFile(c, bucket)
	if !ok {
		return
	}
	Require(c, file.Public || RequestTokenCanReadBucket(c, bucket.Name))

	if file.Status != model.FileStatusActive {
		c.JSON(http.StatusConflict, gin.H{"error": "file upload has not been completed"})
		return
	}

	body, err := service.OpenFile(c.Request.Context(), file)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer body.Close()

	contentType := file.ContentType
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	c.DataFromReader(http.StatusOK, file.SizeBytes, contentType, body, map[string]string{
		"Content-Disposition": fmt.Sprintf("inline; filename=%q", file.Name),
	})
}

func UpdateFile(c *gin.Context) {
	Require(c, RequestTokenCanWriteBucket(c, c.Param("bucketName")))

	bucket, ok := findBucket(c)
	if !ok {
		return
	}
	file, ok := findFile(c, bucket)
	if !ok {
		return
	}

	var req struct {
		Name   *string            `json:"name"`
		Path   *string            `json:"path"`
		Public *bool              `json:"public"`
		Tags   *map[string]string `json:"tags"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.Name != nil {
		if *req.Name == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "name cannot be empty"})
			return
		}
		file.Name = *req.Name
	}
	if req.Path != nil {
		file.Path = *req.Path
	}
	if req.Public != nil {
		file.Public = *req.Public
	}
	if req.Tags != nil {
		file.Tags = *req.Tags
	}
	file.UpdatedByEntityID = GetRequestTokenEntityID(c)

	updated, err := service.UpdateFile(file)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, updated)
}

func DeleteFile(c *gin.Context) {
	Require(c, RequestTokenCanWriteBucket(c, c.Param("bucketName")))

	bucket, ok := findBucket(c)
	if !ok {
		return
	}
	file, ok := findFile(c, bucket)
	if !ok {
		return
	}
	if err := service.DeleteFile(c.Request.Context(), file); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "file deleted"})
}

func CreateDownloadURL(c *gin.Context) {
	bucket, ok := findBucket(c)
	if !ok {
		return
	}
	file, ok := findFile(c, bucket)
	if !ok {
		return
	}
	Require(c, file.Public || RequestTokenCanReadBucket(c, bucket.Name))

	if file.Status != model.FileStatusActive {
		c.JSON(http.StatusConflict, gin.H{"error": "file upload has not been completed"})
		return
	}

	request, err := service.PresignDownload(c.Request.Context(), file)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"url":        request.URL,
		"method":     request.Method,
		"expires_at": request.ExpiresAt,
	})
}

func InitiateUpload(c *gin.Context) {
	Require(c, RequestTokenCanWriteBucket(c, c.Param("bucketName")))

	bucket, ok := findBucket(c)
	if !ok {
		return
	}

	var req struct {
		Name        string            `json:"name"`
		Path        string            `json:"path"`
		ContentType string            `json:"content_type"`
		Public      bool              `json:"public"`
		Tags        map[string]string `json:"tags"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.Name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "name is required"})
		return
	}

	file := model.File{
		Name:              req.Name,
		Path:              req.Path,
		ContentType:       req.ContentType,
		Public:            req.Public,
		Tags:              req.Tags,
		CreatedByEntityID: GetRequestTokenEntityID(c),
		UpdatedByEntityID: GetRequestTokenEntityID(c),
	}
	created, request, err := service.InitiateUpload(c.Request.Context(), bucket, file)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, gin.H{
		"file":       created,
		"upload_url": request.URL,
		"method":     request.Method,
		"expires_at": request.ExpiresAt,
	})
}

func CompleteUpload(c *gin.Context) {
	Require(c, RequestTokenCanWriteBucket(c, c.Param("bucketName")))

	bucket, ok := findBucket(c)
	if !ok {
		return
	}
	file, ok := findFile(c, bucket)
	if !ok {
		return
	}
	if file.Status == model.FileStatusActive {
		c.JSON(http.StatusOK, file)
		return
	}

	file.UpdatedByEntityID = GetRequestTokenEntityID(c)
	completed, err := service.CompleteUpload(c.Request.Context(), file)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, completed)
}
