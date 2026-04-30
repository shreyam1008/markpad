package main

import (
	"log"
	"os"

	"gioui.org/app"

	"markpad/internal/desktop"
)

func main() {
	go func() {
		if err := desktop.Run(os.Args[1:]); err != nil {
			log.Fatal(err)
		}
	}()
	app.Main()
}
