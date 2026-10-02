package main

import (
	"io/fs"
	"net/http"
	"net/http/httptest"
	"net/url"
	"regexp"
	"strings"
	"testing"
	"testing/fstest"
)

func frontendGet(h http.Handler, path string) *httptest.ResponseRecorder {
	w := httptest.NewRecorder()
	h.ServeHTTP(w, httptest.NewRequest("GET", path, nil))
	return w
}
func frontendEntry(t *testing.T, h http.Handler) string {
	t.Helper()
	w := frontendGet(h, "/")
	if w.Code != 200 || w.Header().Get("Cache-Control") != "no-store" {
		t.Fatal("document can be cached", w.Code, w.Header())
	}
	match := regexp.MustCompile(`src="(/_build/[0-9a-f]+/app.js)"`).FindStringSubmatch(w.Body.String())
	if len(match) != 2 || strings.Contains(w.Body.String(), "{{FRONTEND_VERSION}}") {
		t.Fatal("unversioned entry point")
	}
	return match[1]
}
func TestFrontendVersionChangesWithNestedModules(t *testing.T) {
	web := fstest.MapFS{
		"index.html":       {Data: []byte(`<script type="module" src="/_build/{{FRONTEND_VERSION}}/app.js"></script>`)},
		"app.js":           {Data: []byte(`import './start-screen.mjs';`)},
		"start-screen.mjs": {Data: []byte(`export const field='radio';`)},
	}
	old, err := newFrontendFiles(web)
	if err != nil {
		t.Fatal(err)
	}
	oldEntry := frontendEntry(t, old)
	web["start-screen.mjs"] = &fstest.MapFile{Data: []byte(`export const field='select';`)}
	next, err := newFrontendFiles(web)
	if err != nil {
		t.Fatal(err)
	}
	nextEntry := frontendEntry(t, next)
	if oldEntry == nextEntry {
		t.Fatal("changing a nested module reused the previous entry point URL")
	}
	if got := frontendGet(next, oldEntry); got.Code != 410 || got.Header().Get("Cache-Control") != "no-store" {
		t.Fatal("old release URL silently serves new code")
	}
	path := strings.TrimSuffix(nextEntry, "app.js") + "start-screen.mjs"
	if w := frontendGet(next, path); w.Code != 200 || !strings.Contains(w.Body.String(), "'select'") || !strings.Contains(w.Header().Get("Cache-Control"), "immutable") {
		t.Fatal("new release missing", w.Code)
	}
}
func TestFrontendModuleGraphUsesOneRelease(t *testing.T) {
	s, err := newServer(t.TempDir(), 10)
	if err != nil {
		t.Fatal(err)
	}
	entry := frontendEntry(t, s)
	prefix := strings.TrimSuffix(entry, "app.js")
	imports := regexp.MustCompile(`from ['"]([^'"]+)['"]`)
	queue := []string{entry}
	seen := map[string]bool{}
	for len(queue) > 0 {
		path := queue[0]
		queue = queue[1:]
		if seen[path] {
			continue
		}
		seen[path] = true
		w := frontendGet(s, path)
		if w.Code != 200 {
			t.Fatal(path, w.Code)
		}
		if !strings.HasPrefix(path, prefix) || !strings.Contains(w.Header().Get("Content-Type"), "javascript") {
			t.Fatal("module outside release", path, w.Header())
		}
		base, _ := url.Parse(path)
		for _, match := range imports.FindAllStringSubmatch(w.Body.String(), -1) {
			ref, err := url.Parse(match[1])
			if err != nil {
				t.Fatal(err)
			}
			queue = append(queue, base.ResolveReference(ref).String())
		}
	}
	if len(seen) < 15 {
		t.Fatal("incomplete module graph", seen)
	}
	for _, path := range []string{"/app.js?v=20260928-built-castles", "/start-screen.mjs?v=20260928-built-castles", "/style.css"} {
		w := frontendGet(s, path)
		if w.Code != 200 || w.Header().Get("Cache-Control") != "no-store" {
			t.Fatal("legacy module can be cached", path, w.Code)
		}
	}
	for _, path := range []string{prefix + ".env", prefix + "../.env"} {
		if w := frontendGet(s, path); w.Code != 404 {
			t.Fatal("private file exposed", path, w.Code)
		}
	}
	for _, path := range []string{prefix + "style.css", "/assets/board.json"} {
		if w := frontendGet(s, path); w.Code != 200 {
			t.Fatal("asset missing", path, w.Code)
		}
	}
}
func TestFrontendNoReleaseForMissingDocument(t *testing.T) {
	if _, err := newFrontendFiles(fstest.MapFS{}); err == nil {
		t.Fatal("missing document accepted")
	}
	web, _ := fs.Sub(assets, "web")
	if _, err := newFrontendFiles(web); err != nil {
		t.Fatal(err)
	}
}
