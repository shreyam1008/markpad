package session

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

const (
	sessionFile = "session.json"
	draftsDir   = "drafts"
)

type Document struct {
	ID        string    `json:"id"`
	Title     string    `json:"title"`
	Path      string    `json:"path,omitempty"`
	DraftFile string    `json:"draft_file"`
	Dirty     bool      `json:"dirty"`
	UpdatedAt time.Time `json:"updated_at"`
	SavedAt   time.Time `json:"saved_at,omitempty"`
}

type Session struct {
	ActiveID  string      `json:"active_id"`
	Documents []*Document `json:"documents"`
}

type Store struct {
	root  string
	draft string
}

func NewStore(appName string) (*Store, error) {
	dir, err := os.UserConfigDir()
	if err != nil {
		return nil, err
	}
	return NewStoreAt(filepath.Join(dir, appName))
}

func NewStoreAt(root string) (*Store, error) {
	store := &Store{
		root:  root,
		draft: filepath.Join(root, draftsDir),
	}
	if err := os.MkdirAll(store.draft, 0o755); err != nil {
		return nil, err
	}
	return store, nil
}

func (s *Store) Root() string {
	return s.root
}

func (s *Store) Load() (*Session, error) {
	path := filepath.Join(s.root, sessionFile)
	data, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		doc := NewDocument("", "# Untitled\n\nStart writing. Markpad will keep this draft even if you close the app.\n")
		return &Session{ActiveID: doc.ID, Documents: []*Document{doc}}, nil
	}
	if err != nil {
		return nil, err
	}

	var sess Session
	if err := json.Unmarshal(data, &sess); err != nil {
		return nil, err
	}
	if len(sess.Documents) == 0 {
		doc := NewDocument("", "# Untitled\n\n")
		sess.Documents = []*Document{doc}
		sess.ActiveID = doc.ID
	}
	for _, doc := range sess.Documents {
		normalizeDocument(doc)
	}
	if sess.ActiveID == "" || sess.Find(sess.ActiveID) == nil {
		sess.ActiveID = sess.Documents[0].ID
	}
	return &sess, nil
}

func (s *Store) Save(sess *Session) error {
	if err := os.MkdirAll(s.root, 0o755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(sess, "", "  ")
	if err != nil {
		return err
	}
	return atomicWrite(filepath.Join(s.root, sessionFile), data, 0o644)
}

func (s *Store) DraftPath(doc *Document) string {
	normalizeDocument(doc)
	return filepath.Join(s.draft, doc.DraftFile)
}

func (s *Store) ReadDraft(doc *Document) (string, error) {
	data, err := os.ReadFile(s.DraftPath(doc))
	if errors.Is(err, os.ErrNotExist) {
		if doc.Path != "" {
			file, readErr := os.ReadFile(doc.Path)
			if readErr == nil {
				return string(file), nil
			}
		}
		return "", nil
	}
	if err != nil {
		return "", err
	}
	return string(data), nil
}

func (s *Store) WriteDraft(doc *Document, content string) error {
	if err := os.MkdirAll(s.draft, 0o755); err != nil {
		return err
	}
	return atomicWrite(s.DraftPath(doc), []byte(content), 0o644)
}

func (s *Store) SaveToDisk(doc *Document, content string) error {
	if doc.Path == "" {
		return errors.New("document has no save path")
	}
	if err := atomicWrite(doc.Path, []byte(content), 0o644); err != nil {
		return err
	}
	now := time.Now()
	doc.Dirty = false
	doc.SavedAt = now
	doc.UpdatedAt = now
	doc.Title = TitleFromContent(content, doc.Path)
	return s.WriteDraft(doc, content)
}

func (sess *Session) Find(id string) *Document {
	for _, doc := range sess.Documents {
		if doc.ID == id {
			return doc
		}
	}
	return nil
}

func (sess *Session) Active() *Document {
	if doc := sess.Find(sess.ActiveID); doc != nil {
		return doc
	}
	if len(sess.Documents) == 0 {
		return nil
	}
	sess.ActiveID = sess.Documents[0].ID
	return sess.Documents[0]
}

func (sess *Session) Add(doc *Document) {
	if existing := sess.Find(doc.ID); existing != nil {
		sess.ActiveID = existing.ID
		return
	}
	sess.Documents = append([]*Document{doc}, sess.Documents...)
	sess.ActiveID = doc.ID
}

func (sess *Session) AddFile(path string, content string) *Document {
	abs, err := filepath.Abs(path)
	if err == nil {
		path = abs
	}
	for _, doc := range sess.Documents {
		if samePath(doc.Path, path) {
			sess.ActiveID = doc.ID
			return doc
		}
	}
	doc := NewDocument(path, content)
	doc.Dirty = false
	doc.SavedAt = time.Now()
	sess.Add(doc)
	return doc
}

func NewDocument(path string, content string) *Document {
	now := time.Now()
	id := NewID()
	doc := &Document{
		ID:        id,
		Title:     TitleFromContent(content, path),
		Path:      path,
		DraftFile: id + ".md",
		Dirty:     path == "",
		UpdatedAt: now,
	}
	return doc
}

func NewID() string {
	var b [6]byte
	if _, err := rand.Read(b[:]); err == nil {
		return fmt.Sprintf("%d-%s", time.Now().UnixNano(), hex.EncodeToString(b[:]))
	}
	return fmt.Sprintf("%d", time.Now().UnixNano())
}

func TitleFromContent(content string, path string) string {
	for _, line := range strings.Split(content, "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		if strings.HasPrefix(line, "#") {
			line = strings.TrimLeft(line, "#")
			line = strings.TrimSpace(line)
		}
		if line != "" {
			return truncate(line, 80)
		}
	}
	if path != "" {
		base := filepath.Base(path)
		ext := filepath.Ext(base)
		return strings.TrimSuffix(base, ext)
	}
	return "Untitled"
}

func normalizeDocument(doc *Document) {
	if doc.ID == "" {
		doc.ID = NewID()
	}
	if doc.DraftFile == "" {
		doc.DraftFile = doc.ID + ".md"
	}
	doc.DraftFile = filepath.Base(doc.DraftFile)
	if doc.Title == "" {
		doc.Title = "Untitled"
	}
}

func atomicWrite(path string, data []byte, mode os.FileMode) error {
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	tmp, err := os.CreateTemp(dir, ".tmp-*")
	if err != nil {
		return err
	}
	tmpName := tmp.Name()
	defer os.Remove(tmpName)

	if _, err := tmp.Write(data); err != nil {
		_ = tmp.Close()
		return err
	}
	if err := tmp.Chmod(mode); err != nil {
		_ = tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	return os.Rename(tmpName, path)
}

func truncate(value string, max int) string {
	if len(value) <= max {
		return value
	}
	return strings.TrimSpace(value[:max-1]) + "..."
}

func samePath(a string, b string) bool {
	if a == "" || b == "" {
		return false
	}
	aa, errA := filepath.Abs(a)
	bb, errB := filepath.Abs(b)
	if errA == nil {
		a = aa
	}
	if errB == nil {
		b = bb
	}
	return filepath.Clean(a) == filepath.Clean(b)
}
