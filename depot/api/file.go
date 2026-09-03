package api

import (
	"bufio"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

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
	file, err := service.GetBucketFileByID(bucket.ID, c.Param("id"))
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

// publiclyReadable reports whether a file may be served without a token. Both
// the file's own flag and its bucket's must allow it, which makes
// AllowPublicFiles a bucket-wide kill switch for anonymous access — the only
// way to walk back an accidental public upload now that files are append-only.
func publiclyReadable(bucket model.Bucket, file model.File) bool {
	return file.Public && bucket.AllowPublicFiles
}

// sniffLen is what http.DetectContentType inspects.
const sniffLen = 512

// findFileByID resolves a file addressed by id alone, along with the bucket
// that owns it, since authorization is a property of the bucket.
func findFileByID(c *gin.Context) (model.File, model.Bucket, bool) {
	file, err := service.GetFileByID(c.Param("fileID"))
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "file not found"})
			return model.File{}, model.Bucket{}, false
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return model.File{}, model.Bucket{}, false
	}
	bucket, err := service.GetBucketByID(file.BucketID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return model.File{}, model.Bucket{}, false
	}
	return file, bucket, true
}

func parseListParams(c *gin.Context) (limit int, offset int, ok bool) {
	limit, err := strconv.Atoi(c.DefaultQuery("limit", "100"))
	if err != nil || limit < 1 || limit > 1000 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "limit must be an integer between 1 and 1000"})
		return 0, 0, false
	}
	offset, err = strconv.Atoi(c.DefaultQuery("offset", "0"))
	if err != nil || offset < 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "offset must be a non-negative integer"})
		return 0, 0, false
	}
	return limit, offset, true
}

func ListFiles(c *gin.Context) {
	bucket, ok := findBucket(c)
	if !ok {
		return
	}
	Require(c, RequestTokenCanReadBucket(c, bucket))

	limit, offset, ok := parseListParams(c)
	if !ok {
		return
	}
	status := model.FileStatus(c.DefaultQuery("status", string(model.FileStatusActive)))

	files, err := service.ListFiles(service.FileQuery{
		BucketIDs:  []string{bucket.ID},
		PathPrefix: c.Query("path_prefix"),
		Search:     c.Query("q"),
		Status:     status,
		Limit:      limit,
		Offset:     offset,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, files)
}

func SearchFiles(c *gin.Context) {
	Require(c, RequestTokenExists(c))

	query := c.Query("q")
	if query == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "q is required"})
		return
	}
	limit, offset, ok := parseListParams(c)
	if !ok {
		return
	}

	buckets, err := service.GetAllBuckets()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	bucketIDs := []string{}
	for _, bucket := range buckets {
		if RequestTokenCanReadBucket(c, bucket) {
			bucketIDs = append(bucketIDs, bucket.ID)
		}
	}
	if len(bucketIDs) == 0 {
		c.JSON(http.StatusOK, []model.File{})
		return
	}

	files, err := service.ListFiles(service.FileQuery{
		BucketIDs: bucketIDs,
		Search:    query,
		Status:    model.FileStatusActive,
		Limit:     limit,
		Offset:    offset,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, files)
}

type attributionFilePage struct {
	Files      []model.File `json:"files"`
	NextOffset *int         `json:"next_offset,omitempty"`
}

func ListAttributionFiles(c *gin.Context) {
	Require(c, RequestTokenExists(c))

	entityID := strings.TrimSpace(c.Query("uploader_entity_id"))
	clientID := strings.TrimSpace(c.Query("application_client_id"))
	if (entityID == "") == (clientID == "") {
		c.JSON(http.StatusBadRequest, gin.H{"error": "provide exactly one uploader_entity_id or application_client_id"})
		return
	}
	limit, offset, ok := parseListParams(c)
	if !ok {
		return
	}

	bucketIDs, err := accessibleBucketIDs(c)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if len(bucketIDs) == 0 {
		c.JSON(http.StatusOK, attributionFilePage{Files: []model.File{}})
		return
	}

	files, err := service.ListFiles(service.FileQuery{
		BucketIDs:         bucketIDs,
		Search:            strings.TrimSpace(c.Query("q")),
		CreatedByEntityID: entityID,
		CreatedByClientID: clientID,
		Status:            model.FileStatusActive,
		Limit:             limit + 1,
		Offset:            offset,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	page := attributionFilePage{Files: files}
	if len(files) > limit {
		nextOffset := offset + limit
		page.Files = files[:limit]
		page.NextOffset = &nextOffset
	}
	c.JSON(http.StatusOK, page)
}

func UploadFile(c *gin.Context) {
	bucket, ok := findBucket(c)
	if !ok {
		return
	}
	Require(c, RequestTokenCanUploadToBucket(c, bucket))

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
		OriginalName:      c.PostForm("original_name"),
		Path:              c.PostForm("path"),
		ContentType:       c.PostForm("content_type"),
		CreatedByEntityID: GetRequestTokenEntityID(c),
		CreatedByClientID: GetRequestTokenClientID(c),
		UpdatedByEntityID: GetRequestTokenEntityID(c),
		UpdatedByClientID: GetRequestTokenClientID(c),
	}
	if file.OriginalName == "" {
		file.OriginalName = formFile.Filename
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
	if file.Public && !bucket.AllowPublicFiles {
		c.JSON(http.StatusBadRequest, gin.H{"error": "this bucket does not allow public files"})
		return
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

	// Depot is the only party that sees these bytes, so when the client reports
	// no content type, sniff it here rather than storing the object as an opaque
	// blob. Peeking leaves the reader positioned at the start for the upload.
	reader := bufio.NewReaderSize(body, sniffLen)
	if file.ContentType == "" {
		if head, err := reader.Peek(sniffLen); err == nil || err == io.EOF {
			file.ContentType = http.DetectContentType(head)
		}
	}

	created, err := service.UploadFile(c.Request.Context(), bucket, file, reader, c.PostForm("storage_backend"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	service.RecordAccess(created, model.AccessActionUpload, requestActor(c))
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
	Require(c, publiclyReadable(bucket, file) || RequestTokenCanReadBucket(c, bucket))

	c.JSON(http.StatusOK, file)
}

func GetFileAccessLogs(c *gin.Context) {
	bucket, ok := findBucket(c)
	if !ok {
		return
	}
	file, ok := findFile(c, bucket)
	if !ok {
		return
	}
	Require(c, RequestTokenIsAdmin(c))

	limit, err := strconv.Atoi(c.DefaultQuery("limit", "5"))
	if err != nil || limit < 1 || limit > 100 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "limit must be an integer between 1 and 100"})
		return
	}

	logs, err := service.ListFileAccessLogs(file.ID, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, logs)
}

func DownloadFile(c *gin.Context) {
	if tokenID, exists := c.GetQuery("token"); exists {
		if tokenID == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "download token is required"})
			return
		}
		downloadFileWithToken(c, c.Param("fileID"), tokenID)
		return
	}

	file, bucket, ok := findFileByID(c)
	if !ok {
		return
	}
	Require(c, publiclyReadable(bucket, file) || RequestTokenCanReadBucket(c, bucket))

	if file.Status != model.FileStatusActive {
		c.JSON(http.StatusConflict, gin.H{"error": "file upload has not been completed"})
		return
	}

	actor := requestActor(c)
	written, err := streamFile(c, file, fmt.Sprintf("attachment; filename=%q", file.DownloadName()))
	if err != nil {
		service.RecordAccess(file, model.AccessActionDownloadFailed, actor)
		handleFileStreamError(c, file, written, err)
		return
	}
	service.RecordAccess(file, model.AccessActionDownload, actor)
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
	Require(c, RequestTokenExists(c) && (publiclyReadable(bucket, file) || RequestTokenCanReadBucket(c, bucket)))

	if file.Status != model.FileStatusActive {
		c.JSON(http.StatusConflict, gin.H{"error": "file upload has not been completed"})
		return
	}

	token, err := service.CreateDownloadToken(file, requestActor(c))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.Header("Cache-Control", "no-store")
	path := "/api/download/" + url.PathEscape(file.ID) + "?token=" + url.QueryEscape(token.ID)
	c.JSON(http.StatusOK, gin.H{
		"url":        requestBaseURL(c) + path,
		"path":       path,
		"method":     http.MethodGet,
		"expires_at": token.ExpiresAt,
	})
}

func downloadFileWithToken(c *gin.Context, fileID string, tokenID string) {
	token, file, err := service.ResolveDownloadToken(tokenID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "download token not found or expired"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if file.ID != fileID {
		c.JSON(http.StatusNotFound, gin.H{"error": "download token not found or expired"})
		return
	}
	if file.Status != model.FileStatusActive {
		c.JSON(http.StatusConflict, gin.H{"error": "file upload has not been completed"})
		return
	}

	actor := service.Actor{
		EntityID: token.EntityID,
		ClientID: token.ClientID,
		Type:     token.ActorType,
	}
	secondsRemaining := max(0, int64(time.Until(token.ExpiresAt).Seconds()))
	c.Header("Cache-Control", fmt.Sprintf("private, max-age=%d", secondsRemaining))
	c.Header("Content-Security-Policy", "sandbox; default-src 'none'")
	c.Header("Referrer-Policy", "no-referrer")
	c.Header("X-Content-Type-Options", "nosniff")

	written, err := streamFile(c, file, fmt.Sprintf("inline; filename=%q", file.DownloadName()))
	if err != nil {
		service.RecordAccess(file, model.AccessActionDownloadFailed, actor)
		handleFileStreamError(c, file, written, err)
		return
	}
	service.RecordAccess(file, model.AccessActionDownload, actor)
}

func streamFile(c *gin.Context, file model.File, contentDisposition string) (int64, error) {
	body, err := service.OpenFile(c.Request.Context(), file)
	if err != nil {
		return 0, err
	}
	defer body.Close()

	contentType := file.ContentType
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	c.Header("Content-Disposition", contentDisposition)
	c.Header("Content-Length", strconv.FormatInt(file.SizeBytes, 10))
	c.Header("Content-Type", contentType)
	c.Status(http.StatusOK)

	written, err := io.Copy(c.Writer, body)
	if err == nil && written != file.SizeBytes {
		err = fmt.Errorf("incomplete transfer: wrote %d of %d bytes", written, file.SizeBytes)
	}
	return written, err
}

func handleFileStreamError(c *gin.Context, file model.File, written int64, err error) {
	streamErr := fmt.Errorf("failed to stream file %s after %d bytes: %w", file.ID, written, err)
	if !c.Writer.Written() {
		c.JSON(http.StatusInternalServerError, gin.H{"error": streamErr.Error()})
		return
	}
	_ = c.Error(streamErr)
}

func InitiateUpload(c *gin.Context) {
	bucket, ok := findBucket(c)
	if !ok {
		return
	}
	Require(c, RequestTokenCanUploadToBucket(c, bucket))

	var req struct {
		OriginalName   string            `json:"original_name"`
		Path           string            `json:"path"`
		ContentType    string            `json:"content_type"`
		Public         bool              `json:"public"`
		Tags           map[string]string `json:"tags"`
		StorageBackend string            `json:"storage_backend"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.Public && !bucket.AllowPublicFiles {
		c.JSON(http.StatusBadRequest, gin.H{"error": "this bucket does not allow public files"})
		return
	}

	file := model.File{
		OriginalName:      req.OriginalName,
		Path:              req.Path,
		ContentType:       req.ContentType,
		Public:            req.Public,
		Tags:              req.Tags,
		CreatedByEntityID: GetRequestTokenEntityID(c),
		CreatedByClientID: GetRequestTokenClientID(c),
		UpdatedByEntityID: GetRequestTokenEntityID(c),
		UpdatedByClientID: GetRequestTokenClientID(c),
	}
	created, request, err := service.InitiateUpload(c.Request.Context(), bucket, file, req.StorageBackend)
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
	bucket, ok := findBucket(c)
	if !ok {
		return
	}
	Require(c, RequestTokenCanUploadToBucket(c, bucket))

	file, ok := findFile(c, bucket)
	if !ok {
		return
	}
	if file.Status == model.FileStatusActive {
		c.JSON(http.StatusOK, file)
		return
	}
	if !RequestTokenIsAdmin(c) && file.CreatedByClientID != GetRequestTokenClientID(c) {
		c.JSON(http.StatusForbidden, gin.H{"error": "this upload was initiated by a different application"})
		return
	}

	file.UpdatedByEntityID = GetRequestTokenEntityID(c)
	file.UpdatedByClientID = GetRequestTokenClientID(c)
	completed, err := service.CompleteUpload(c.Request.Context(), file)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	service.RecordAccess(completed, model.AccessActionPresignUpload, requestActor(c))
	c.JSON(http.StatusOK, completed)
}
