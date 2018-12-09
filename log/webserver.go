package main

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"time"
)

func storage(w http.ResponseWriter, r *http.Request) {
	log.Println("message received")
	r.ParseForm()
	fd, err := os.Create(time.Now().Format("2006-01-02T15:04:05-0700"))
	if err != nil {
		panic(err)
	}
	defer fd.Close()
	for k, v := range r.Form {
		fd.Write([]byte(k))
		fd.Write([]byte(strings.Join(v, "")))
	}
	fmt.Fprintf(w, `{"message": "ok"}`)
}

func main() {
	fs := http.FileServer(http.Dir(".."))
	http.Handle("/jeopardy/", http.StripPrefix("/jeopardy/", fs))
	http.HandleFunc("/store/", storage)      // set router
	err := http.ListenAndServe(":3141", nil) // set listen port
	if err != nil {
		panic(err)
	}
}
