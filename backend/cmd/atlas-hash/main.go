package main

import (
	"log"

	"ariga.io/atlas/sql/migrate"
)

func main() {
	dir, err := migrate.NewLocalDir("migrations")
	if err != nil {
		log.Fatalf("failed to open migrations dir: %v", err)
	}
	sum, err := dir.Checksum()
	if err != nil {
		log.Fatalf("failed to compute checksum: %v", err)
	}
	if err := migrate.WriteSumFile(dir, sum); err != nil {
		log.Fatalf("failed to write sum file: %v", err)
	}
	log.Println("atlas.sum successfully updated")
}
