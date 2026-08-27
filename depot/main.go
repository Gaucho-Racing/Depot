package main

import (
	"github.com/gaucho-racing/depot/depot/api"
	"github.com/gaucho-racing/depot/depot/config"
	"github.com/gaucho-racing/depot/depot/database"
	"github.com/gaucho-racing/depot/depot/pkg/logger"
	"github.com/gaucho-racing/depot/depot/pkg/sentinel"
	"github.com/gaucho-racing/depot/depot/service"
)

func main() {
	logger.Init(config.IsProduction())
	defer logger.Logger.Sync()

	config.Verify()
	config.PrintStartupBanner()
	sentinel.InitializeKeys()
	database.Init()
	service.InitializeStorage()

	api.Run()
}
