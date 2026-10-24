package app

import (
	"stovo-messenger/backend/internal/adapters/canvasstore"
	"stovo-messenger/backend/internal/adapters/intelligencesourcev2"
)

func (s *Server) canvasPersistence() *canvasstore.Store {
	if s.canvasDB == nil {
		return nil
	}
	return canvasstore.NewPostgresStore(s.canvasDB)
}

func (s *Server) intelligenceSourceV2Persistence() *intelligencesourcev2.Store {
	if s.sqlDB == nil {
		return nil
	}
	return intelligencesourcev2.NewPostgresStore(s.sqlDB)
}
