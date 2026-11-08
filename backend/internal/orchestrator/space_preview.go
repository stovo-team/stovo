package orchestrator

import (
	"bytes"
	"fmt"
	"html"
	"image"
	"image/color"
	"image/png"
	"net/http"
	"os"
	"regexp"
	"strings"

	"github.com/go-chi/chi/v5"
)

const (
	previewTitle       = "Stovo Space"
	previewDescription = "A space for connection and collaboration on Stovo."
	previewWidth       = 1200
	previewHeight      = 630
)

var validPreviewSlug = regexp.MustCompile(`^[a-zA-Z0-9_-]{1,64}$`)

func (o *Orchestrator) handleSpacePreview(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	name, ok := o.publicSpaceName(slug)
	if !ok {
		name = previewTitle
	}
	baseURL := strings.TrimRight(strings.TrimSpace(os.Getenv("APP_URL")), "/")
	if baseURL == "" {
		baseURL = "http://localhost:8000"
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Write([]byte(renderSpacePreviewHTML(baseURL, slug, name, ok)))
}

func renderSpacePreviewHTML(baseURL, slug, name string, isPublic bool) string {
	canonicalURL := baseURL + "/s/" + slug
	imageURL := canonicalURL + "/og.png"
	title := name + " | Stovo"
	description := previewDescription
	if isPublic {
		description = "Join " + name + " on Stovo, a space for connection and collaboration."
	}
	return fmt.Sprintf(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>%s</title><meta name="description" content="%s"><meta property="og:type" content="website"><meta property="og:title" content="%s"><meta property="og:description" content="%s"><meta property="og:url" content="%s"><meta property="og:image" content="%s"><meta property="og:image:type" content="image/png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="%s"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="%s"><meta name="twitter:description" content="%s"><meta name="twitter:image" content="%s"></head><body><div id="root"></div></body></html>`, html.EscapeString(title), html.EscapeString(description), html.EscapeString(title), html.EscapeString(description), html.EscapeString(canonicalURL), html.EscapeString(imageURL), html.EscapeString(title), html.EscapeString(title), html.EscapeString(description), html.EscapeString(imageURL))
}

func (o *Orchestrator) publicSpaceName(slug string) (string, bool) {
	if o.masterDB == nil || !validPreviewSlug.MatchString(slug) {
		return "", false
	}
	var name string
	var isPublic bool
	err := o.masterDB.QueryRow(`SELECT name, public_preview FROM servers WHERE slug=$1`, slug).Scan(&name, &isPublic)
	if err != nil {
		return "", false
	}
	return publicPreviewName(name, isPublic)
}

func publicPreviewName(name string, isPublic bool) (string, bool) {
	name = strings.TrimSpace(name)
	if !isPublic || name == "" {
		return "", false
	}
	return name, true
}

func (o *Orchestrator) handleSpacePreviewImage(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	name, ok := o.publicSpaceName(slug)
	if !ok {
		name = previewTitle
	}
	data, err := renderPreviewPNG(name)
	if err != nil {
		http.Error(w, "preview unavailable", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "image/png")
	w.Header().Set("Content-Length", fmt.Sprint(len(data)))
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	_, _ = w.Write(data)
}

// renderPreviewPNG creates a deterministic, branded 1200x630 PNG without
// loading user supplied files, fonts, or remote resources.
func renderPreviewPNG(name string) ([]byte, error) {
	canvas := image.NewRGBA(image.Rect(0, 0, previewWidth, previewHeight))
	for y := 0; y < previewHeight; y++ {
		mix := uint8(20 + 35*y/previewHeight)
		for x := 0; x < previewWidth; x++ {
			canvas.SetRGBA(x, y, color.RGBA{R: 20, G: 25 + mix/2, B: 58 + mix, A: 255})
		}
	}
	accent := color.RGBA{R: 94, G: 112, B: 255, A: 255}
	for y := 0; y < 18; y++ {
		for x := 72; x < 172; x++ {
			canvas.SetRGBA(x, y+72, accent)
		}
	}
	// A compact Stovo wordmark, drawn from a stable 5x7 bitmap alphabet.
	drawBitmapText(canvas, 72, 128, "STOVO", color.RGBA{R: 235, G: 239, B: 255, A: 255}, 5)
	label := transliteratePreviewName(strings.ToUpper(strings.TrimSpace(name)))
	if label == "" {
		label = previewTitle
	}
	labelRunes := []rune(label)
	if len(labelRunes) > 36 {
		label = string(labelRunes[:36])
	}
	drawBitmapText(canvas, 72, 250, label, color.RGBA{R: 255, G: 255, B: 255, A: 255}, 8)
	drawBitmapText(canvas, 72, 410, "A SPACE FOR CONNECTION", color.RGBA{R: 173, G: 184, B: 220, A: 255}, 4)
	var out bytes.Buffer
	if err := png.Encode(&out, canvas); err != nil {
		return nil, err
	}
	return out.Bytes(), nil
}

func transliteratePreviewName(name string) string {
	return strings.NewReplacer(
		"А", "A", "Б", "B", "В", "V", "Г", "G", "Д", "D", "Е", "E", "Ё", "E",
		"Ж", "ZH", "З", "Z", "И", "I", "Й", "I", "К", "K", "Л", "L", "М", "M",
		"Н", "N", "О", "O", "П", "P", "Р", "R", "С", "S", "Т", "T", "У", "U",
		"Ф", "F", "Х", "KH", "Ц", "TS", "Ч", "CH", "Ш", "SH", "Щ", "SHCH",
		"Ъ", "", "Ы", "Y", "Ь", "", "Э", "E", "Ю", "YU", "Я", "YA",
		"Ң", "N", "Ө", "O", "Ү", "U", "Ә", "A", "І", "I", "Ғ", "G", "Қ", "K", "Ұ", "U", "Һ", "H",
	).Replace(name)
}

var bitmapGlyphs = map[rune][7]byte{
	'A': {14, 17, 17, 31, 17, 17, 17}, 'B': {30, 17, 17, 30, 17, 17, 30}, 'C': {14, 17, 16, 16, 16, 17, 14}, 'D': {30, 17, 17, 17, 17, 17, 30}, 'E': {31, 16, 16, 30, 16, 16, 31}, 'F': {31, 16, 16, 30, 16, 16, 16}, 'G': {14, 17, 16, 23, 17, 17, 15}, 'H': {17, 17, 17, 31, 17, 17, 17}, 'I': {31, 4, 4, 4, 4, 4, 31}, 'J': {7, 2, 2, 2, 18, 18, 12}, 'K': {17, 18, 20, 24, 20, 18, 17}, 'L': {16, 16, 16, 16, 16, 16, 31}, 'M': {17, 27, 21, 21, 17, 17, 17}, 'N': {17, 25, 21, 19, 17, 17, 17}, 'O': {14, 17, 17, 17, 17, 17, 14}, 'P': {30, 17, 17, 30, 16, 16, 16}, 'Q': {14, 17, 17, 17, 21, 18, 13}, 'R': {30, 17, 17, 30, 20, 18, 17}, 'S': {15, 16, 16, 14, 1, 1, 30}, 'T': {31, 4, 4, 4, 4, 4, 4}, 'U': {17, 17, 17, 17, 17, 17, 14}, 'V': {17, 17, 17, 17, 17, 10, 4}, 'W': {17, 17, 17, 21, 21, 21, 10}, 'X': {17, 17, 10, 4, 10, 17, 17}, 'Y': {17, 17, 10, 4, 4, 4, 4}, 'Z': {31, 1, 2, 4, 8, 16, 31}, '0': {14, 17, 19, 21, 25, 17, 14}, '1': {4, 12, 4, 4, 4, 4, 14}, '2': {14, 17, 1, 2, 4, 8, 31}, '3': {30, 1, 1, 14, 1, 1, 30}, '4': {2, 6, 10, 18, 31, 2, 2}, '5': {31, 16, 16, 30, 1, 1, 30}, '6': {14, 16, 16, 30, 17, 17, 14}, '7': {31, 1, 2, 4, 8, 8, 8}, '8': {14, 17, 17, 14, 17, 17, 14}, '9': {14, 17, 17, 15, 1, 1, 14}, ' ': {}, '-': {0, 0, 0, 31, 0, 0, 0}, '.': {0, 0, 0, 0, 0, 12, 12}, ':': {0, 12, 12, 0, 12, 12, 0}, '&': {12, 18, 20, 8, 21, 18, 13},
}

func drawBitmapText(dst *image.RGBA, x, y int, text string, c color.RGBA, scale int) {
	for _, char := range text {
		glyph, exists := bitmapGlyphs[char]
		if !exists {
			glyph = bitmapGlyphs[' ']
		}
		for row, bits := range glyph {
			for col := 0; col < 5; col++ {
				if bits&(1<<uint(4-col)) == 0 {
					continue
				}
				for sy := 0; sy < scale; sy++ {
					for sx := 0; sx < scale; sx++ {
						dst.SetRGBA(x+col*scale+sx, y+row*scale+sy, c)
					}
				}
			}
		}
		x += 6 * scale
	}
}
