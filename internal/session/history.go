package session

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

const (
	historyDir     = "history"
	maxSnapshots   = 50
	snapshotSuffix = ".json"
)

type Snapshot struct {
	Timestamp time.Time `json:"timestamp"`
	Source    string    `json:"source"`
	Bytes     int       `json:"bytes"`
	Lines     int       `json:"lines"`
	Preview   string    `json:"preview"`
	Content   string    `json:"content,omitempty"`
}

type HistoryEntry struct {
	Timestamp string `json:"timestamp"`
	Source    string `json:"source"`
	Bytes     int    `json:"bytes"`
	Lines     int    `json:"lines"`
	Preview   string `json:"preview"`
	TimeAgo   string `json:"timeAgo"`
}

func (s *Store) historyDir(docID string) string {
	return filepath.Join(s.root, historyDir, docID)
}

func (s *Store) SaveSnapshot(docID string, content string, source string) error {
	dir := s.historyDir(docID)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}

	now := time.Now()
	lines := 1
	for _, c := range content {
		if c == '\n' {
			lines++
		}
	}

	preview := snapshotPreview(content)

	snap := Snapshot{
		Timestamp: now,
		Source:    source,
		Bytes:     len(content),
		Lines:     lines,
		Preview:   preview,
		Content:   content,
	}

	data, err := json.MarshalIndent(snap, "", "  ")
	if err != nil {
		return err
	}

	filename := fmt.Sprintf("%d%s", now.UnixNano(), snapshotSuffix)
	if err := atomicWrite(filepath.Join(dir, filename), data, 0o644); err != nil {
		return err
	}

	return s.pruneHistory(docID)
}

func (s *Store) ListHistory(docID string) ([]HistoryEntry, error) {
	dir := s.historyDir(docID)
	entries, err := os.ReadDir(dir)
	if err != nil {
		if os.IsNotExist(err) {
			return []HistoryEntry{}, nil
		}
		return nil, err
	}

	now := time.Now()
	var result []HistoryEntry

	type fileSnap struct {
		name string
		snap Snapshot
	}
	var snaps []fileSnap

	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), snapshotSuffix) {
			continue
		}
		data, err := os.ReadFile(filepath.Join(dir, entry.Name()))
		if err != nil {
			continue
		}
		var snap Snapshot
		if err := json.Unmarshal(data, &snap); err != nil {
			continue
		}
		snaps = append(snaps, fileSnap{name: entry.Name(), snap: snap})
	}

	sort.Slice(snaps, func(i, j int) bool {
		return snaps[i].snap.Timestamp.After(snaps[j].snap.Timestamp)
	})

	for _, fs := range snaps {
		result = append(result, HistoryEntry{
			Timestamp: fs.snap.Timestamp.Format(time.RFC3339),
			Source:    fs.snap.Source,
			Bytes:     fs.snap.Bytes,
			Lines:     fs.snap.Lines,
			Preview:   fs.snap.Preview,
			TimeAgo:   timeAgo(now, fs.snap.Timestamp),
		})
	}

	return result, nil
}

func (s *Store) GetSnapshotContent(docID string, timestamp string) (string, error) {
	dir := s.historyDir(docID)
	entries, err := os.ReadDir(dir)
	if err != nil {
		return "", err
	}

	ts, err := time.Parse(time.RFC3339, timestamp)
	if err != nil {
		return "", fmt.Errorf("invalid timestamp: %w", err)
	}

	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), snapshotSuffix) {
			continue
		}
		data, readErr := os.ReadFile(filepath.Join(dir, entry.Name()))
		if readErr != nil {
			continue
		}
		var snap Snapshot
		if json.Unmarshal(data, &snap) != nil {
			continue
		}
		if snap.Timestamp.Equal(ts) {
			return snap.Content, nil
		}
	}

	return "", fmt.Errorf("snapshot not found")
}

func (s *Store) pruneHistory(docID string) error {
	dir := s.historyDir(docID)
	entries, err := os.ReadDir(dir)
	if err != nil {
		return err
	}

	var files []os.DirEntry
	for _, e := range entries {
		if !e.IsDir() && strings.HasSuffix(e.Name(), snapshotSuffix) {
			files = append(files, e)
		}
	}

	if len(files) <= maxSnapshots {
		return nil
	}

	sort.Slice(files, func(i, j int) bool {
		return files[i].Name() < files[j].Name()
	})

	toRemove := len(files) - maxSnapshots
	for i := 0; i < toRemove; i++ {
		_ = os.Remove(filepath.Join(dir, files[i].Name()))
	}

	return nil
}

func snapshotPreview(content string) string {
	lines := strings.SplitN(content, "\n", 4)
	var preview []string
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if trimmed != "" {
			preview = append(preview, trimmed)
		}
		if len(preview) >= 2 {
			break
		}
	}
	result := strings.Join(preview, " ")
	if len(result) > 120 {
		result = result[:117] + "..."
	}
	return result
}

func timeAgo(now, t time.Time) string {
	d := now.Sub(t)
	switch {
	case d < time.Minute:
		return "just now"
	case d < time.Hour:
		m := int(d.Minutes())
		if m == 1 {
			return "1 min ago"
		}
		return fmt.Sprintf("%d min ago", m)
	case d < 24*time.Hour:
		h := int(d.Hours())
		if h == 1 {
			return "1 hour ago"
		}
		return fmt.Sprintf("%d hours ago", h)
	case d < 7*24*time.Hour:
		days := int(d.Hours() / 24)
		if days == 1 {
			return "yesterday"
		}
		return fmt.Sprintf("%d days ago", days)
	default:
		return t.Format("Jan 2, 2006")
	}
}
