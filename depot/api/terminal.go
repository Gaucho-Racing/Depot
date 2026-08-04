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

func ListTerminals(c *gin.Context) {
	Require(c, RequestTokenExists(c))

	terminals, err := service.ListTerminals()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, terminals)
}

type terminalRequest struct {
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

func validProvider(provider string) bool {
	return provider == string(model.TerminalProviderAWSS3) || provider == string(model.TerminalProviderS3Compatible)
}

func CreateTerminal(c *gin.Context) {
	Require(c, RequestTokenIsAdmin(c))

	var req terminalRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.Name == nil || *req.Name == "" || req.Provider == nil || req.Bucket == nil || *req.Bucket == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "name, provider, and bucket are required"})
		return
	}
	if !validProvider(*req.Provider) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "provider must be aws-s3 or s3-compatible"})
		return
	}

	terminal := model.Terminal{
		Name:     *req.Name,
		Provider: model.TerminalProvider(*req.Provider),
		Bucket:   *req.Bucket,
		Enabled:  true,
	}
	if req.Region != nil {
		terminal.Region = *req.Region
	}
	if req.Endpoint != nil {
		terminal.Endpoint = *req.Endpoint
	}
	if req.ForcePathStyle != nil {
		terminal.ForcePathStyle = *req.ForcePathStyle
	}
	if req.AccessKeyID != nil {
		terminal.AccessKeyID = *req.AccessKeyID
	}
	if req.SecretAccessKey != nil {
		terminal.SecretAccessKey = *req.SecretAccessKey
	}
	if req.Default != nil {
		terminal.Default = *req.Default
	}
	if req.Enabled != nil {
		terminal.Enabled = *req.Enabled
	}

	// Reject configs that can't even construct a client before persisting.
	if _, err := service.BuildTerminalBackend(context.Background(), terminal); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	created, err := service.CreateTerminal(terminal)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, created)
}

func findTerminal(c *gin.Context) (model.Terminal, bool) {
	terminal, err := service.GetTerminalByName(c.Param("terminalName"))
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "terminal not found"})
			return model.Terminal{}, false
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return model.Terminal{}, false
	}
	return terminal, true
}

func UpdateTerminal(c *gin.Context) {
	Require(c, RequestTokenIsAdmin(c))

	terminal, ok := findTerminal(c)
	if !ok {
		return
	}

	var req terminalRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.Name != nil && *req.Name != terminal.Name {
		c.JSON(http.StatusBadRequest, gin.H{"error": "terminal names are immutable — files reference them"})
		return
	}
	if req.Provider != nil {
		if !validProvider(*req.Provider) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "provider must be aws-s3 or s3-compatible"})
			return
		}
		terminal.Provider = model.TerminalProvider(*req.Provider)
	}
	if req.Region != nil {
		terminal.Region = *req.Region
	}
	if req.Bucket != nil && *req.Bucket != "" {
		terminal.Bucket = *req.Bucket
	}
	if req.Endpoint != nil {
		terminal.Endpoint = *req.Endpoint
	}
	if req.ForcePathStyle != nil {
		terminal.ForcePathStyle = *req.ForcePathStyle
	}
	if req.AccessKeyID != nil {
		terminal.AccessKeyID = *req.AccessKeyID
	}
	if req.SecretAccessKey != nil {
		terminal.SecretAccessKey = *req.SecretAccessKey
	}
	if req.Default != nil {
		terminal.Default = *req.Default
	}
	if req.Enabled != nil {
		terminal.Enabled = *req.Enabled
	}

	if _, err := service.BuildTerminalBackend(context.Background(), terminal); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	updated, err := service.UpdateTerminal(terminal)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, updated)
}

func DeleteTerminal(c *gin.Context) {
	Require(c, RequestTokenIsAdmin(c))

	terminal, ok := findTerminal(c)
	if !ok {
		return
	}
	if err := service.DeleteTerminal(terminal); err != nil {
		c.JSON(http.StatusConflict, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "terminal deleted"})
}
