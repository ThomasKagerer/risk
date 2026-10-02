package main

import (
	"bytes"
	"crypto/sha256"
	"fmt"
	"io"
	"io/fs"
	"net/http"
	"strings"
	"sync"
	"time"
)

// A release owns a complete module graph. Changing any embedded web file gives
// the entry point AND its relative imports a new URL, including nested imports.
// Hand-edited query strings let old app.js run against a new form after deploys.
var frontendFiles = sync.OnceValue(func() http.Handler {
	web, err := fs.Sub(assets, "web")
	if err != nil {
		panic(err)
	}
	handler, err := newFrontendFiles(web)
	if err != nil {
		panic(err)
	}
	return handler
})

func newFrontendFiles(web fs.FS) (http.Handler, error) {
	h := sha256.New()
	err := fs.WalkDir(web, ".", func(path string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if entry.IsDir() {
			return nil
		}
		info, err := entry.Info()
		if err != nil {
			return err
		}
		fmt.Fprintf(h, "%s\x00%d\x00", path, info.Size())
		f, err := web.Open(path)
		if err != nil {
			return err
		}
		_, err = io.Copy(h, f)
		f.Close()
		return err
	})
	if err != nil {
		return nil, err
	}
	version := fmt.Sprintf("%x", h.Sum(nil))[:32]
	index, err := fs.ReadFile(web, "index.html")
	if err != nil {
		return nil, err
	}
	index = bytes.ReplaceAll(index, []byte("{{FRONTEND_VERSION}}"), []byte(version))
	raw := http.FileServer(http.FS(web))
	prefix := "/_build/" + version
	versioned := http.StripPrefix(prefix, raw)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/" || r.URL.Path == "/index.html" {
			// The document always names the active release, even after a normal reload.
			w.Header().Set("Cache-Control", "no-store")
			http.ServeContent(w, r, "index.html", time.Time{}, bytes.NewReader(index))
			return
		}
		if strings.HasPrefix(r.URL.Path, "/_build/") {
			if !strings.HasPrefix(r.URL.Path, prefix+"/") {
				w.Header().Set("Cache-Control", "no-store")
				http.Error(w, "Die Spieloberfläche wurde aktualisiert. Bitte lade die Seite neu.", http.StatusGone)
				return
			}
			w.Header().Set("Cache-Control", "private, max-age=31536000, immutable")
			versioned.ServeHTTP(w, r)
			return
		}
		// Previously bookmarked unversioned modules must never become permanent
		// cache entries. Images, sounds and board data continue to revalidate.
		if strings.HasSuffix(r.URL.Path, ".js") || strings.HasSuffix(r.URL.Path, ".mjs") || strings.HasSuffix(r.URL.Path, ".css") {
			w.Header().Set("Cache-Control", "no-store")
		}
		raw.ServeHTTP(w, r)
	}), nil
}
