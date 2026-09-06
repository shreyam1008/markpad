package session

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"markpad/internal/brand"
)

const maxSourceHashBytes = 10 << 20

type SourceChangeKind string

const (
	SourceModified   SourceChangeKind = "modified"
	SourceDeleted    SourceChangeKind = "deleted"
	SourceReplaced   SourceChangeKind = "replaced"
	SourceUnverified SourceChangeKind = "unverified"
)

// SourceState is the last disk content Markpad opened or saved. The digest is
// authoritative; size and modification time are retained for useful conflict
// messages and permission-preserving writes.
type SourceState struct {
	Digest     string    `json:"digest,omitempty"`
	Identity   string    `json:"identity,omitempty"`
	Size       int64     `json:"size"`
	ModifiedAt time.Time `json:"modified_at,omitempty"`
	Mode       uint32    `json:"mode,omitempty"`
}

// ExternalChangeError prevents a normal save from replacing a source that no
// longer matches the content Markpad originally opened.
type ExternalChangeError struct {
	Kind    SourceChangeKind
	Path    string
	Current *SourceState
}

func (e *ExternalChangeError) Error() string {
	switch e.Kind {
	case SourceDeleted:
		return fmt.Sprintf("source file was deleted: %s", e.Path)
	case SourceReplaced:
		return fmt.Sprintf("source file was replaced: %s", e.Path)
	case SourceUnverified:
		return fmt.Sprintf("source file changed before %s could establish a safe baseline: %s", brand.ProductName, e.Path)
	default:
		return fmt.Sprintf("source file changed outside %s: %s", brand.ProductName, e.Path)
	}
}

func sourceStateFromContent(content []byte, info os.FileInfo) *SourceState {
	sum := sha256.Sum256(content)
	state := &SourceState{
		Digest: hex.EncodeToString(sum[:]),
		Size:   int64(len(content)),
	}
	if info != nil {
		state.ModifiedAt = info.ModTime()
		state.Mode = uint32(info.Mode().Perm())
	}
	return state
}

func sourceInfo(path string) os.FileInfo {
	info, err := os.Lstat(path)
	if err != nil || !info.Mode().IsRegular() || info.Mode()&os.ModeSymlink != 0 {
		return nil
	}
	return info
}

func sourceStateForPath(path string, content []byte) *SourceState {
	info := sourceInfo(path)
	state := sourceStateFromContent(content, info)
	if info == nil {
		return state
	}
	file, err := os.Open(path)
	if err != nil {
		return state
	}
	defer file.Close()
	opened, err := file.Stat()
	if err == nil && os.SameFile(info, opened) {
		state.Identity = sourceIdentity(file, opened)
	}
	return state
}

// inspectCurrentSource hashes through an open handle and confirms the path
// still identifies that handle after the read. This narrows replacement races
// without loading another copy of the file into memory.
func inspectCurrentSource(path string) (*SourceState, error) {
	pathInfo, err := os.Lstat(path)
	if errors.Is(err, os.ErrNotExist) {
		return nil, &ExternalChangeError{Kind: SourceDeleted, Path: path}
	}
	if err != nil {
		return nil, fmt.Errorf("inspect source file: %w", err)
	}
	if !pathInfo.Mode().IsRegular() || pathInfo.Mode()&os.ModeSymlink != 0 {
		return nil, &ExternalChangeError{Kind: SourceReplaced, Path: path}
	}

	file, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("open source file: %w", err)
	}
	defer file.Close()
	openedBefore, err := file.Stat()
	if err != nil {
		return nil, fmt.Errorf("inspect open source file: %w", err)
	}
	if !os.SameFile(pathInfo, openedBefore) {
		return nil, &ExternalChangeError{Kind: SourceReplaced, Path: path}
	}
	if openedBefore.Size() > maxSourceHashBytes {
		return &SourceState{
			Identity:   sourceIdentity(file, openedBefore),
			Size:       openedBefore.Size(),
			ModifiedAt: openedBefore.ModTime(),
			Mode:       uint32(openedBefore.Mode().Perm()),
		}, nil
	}

	hash := sha256.New()
	if _, err := io.Copy(hash, file); err != nil {
		return nil, fmt.Errorf("read source file: %w", err)
	}
	openedAfter, err := file.Stat()
	if err != nil {
		return nil, fmt.Errorf("reinspect open source file: %w", err)
	}
	pathAfter, err := os.Lstat(path)
	if errors.Is(err, os.ErrNotExist) {
		return nil, &ExternalChangeError{Kind: SourceDeleted, Path: path}
	}
	if err != nil {
		return nil, fmt.Errorf("reinspect source file: %w", err)
	}
	if !pathAfter.Mode().IsRegular() || !os.SameFile(openedAfter, pathAfter) ||
		openedBefore.Size() != openedAfter.Size() ||
		!openedBefore.ModTime().Equal(openedAfter.ModTime()) {
		return nil, &ExternalChangeError{Kind: SourceReplaced, Path: path}
	}

	return &SourceState{
		Digest:     hex.EncodeToString(hash.Sum(nil)),
		Identity:   sourceIdentity(file, openedAfter),
		Size:       openedAfter.Size(),
		ModifiedAt: openedAfter.ModTime(),
		Mode:       uint32(openedAfter.Mode().Perm()),
	}, nil
}

func checkExternalChange(doc *Document) (*SourceState, error) {
	if doc == nil || doc.Path == "" || doc.SourceState == nil {
		return nil, nil
	}
	if doc.SourceState.Digest == "" {
		return nil, &ExternalChangeError{Kind: SourceUnverified, Path: doc.Path}
	}
	current, err := inspectCurrentSource(doc.Path)
	if err != nil {
		return nil, err
	}
	if doc.SourceState.Identity != "" && current.Identity != "" &&
		current.Identity != doc.SourceState.Identity {
		return nil, &ExternalChangeError{
			Kind:    SourceReplaced,
			Path:    doc.Path,
			Current: current,
		}
	}
	if current.Digest == "" {
		return nil, &ExternalChangeError{
			Kind:    SourceModified,
			Path:    doc.Path,
			Current: current,
		}
	}
	if current.Digest != doc.SourceState.Digest {
		return nil, &ExternalChangeError{
			Kind:    SourceModified,
			Path:    doc.Path,
			Current: current,
		}
	}
	return current, nil
}

// RefreshSourceState accepts content read by the desktop boundary only when it
// still matches the current path. It is used by the explicit reload flow so a
// second external edit during reload cannot establish the wrong baseline.
func (s *Store) RefreshSourceState(doc *Document, content []byte) error {
	if doc == nil || doc.Path == "" {
		return errors.New("document has no source path")
	}
	current, err := inspectCurrentSource(doc.Path)
	if err != nil {
		return err
	}
	readState := sourceStateFromContent(content, nil)
	if current.Digest != readState.Digest {
		return &ExternalChangeError{
			Kind:    SourceModified,
			Path:    doc.Path,
			Current: current,
		}
	}
	doc.SourceState = current
	return nil
}

func (s *Store) migrateSourceState(doc *Document) {
	if doc == nil || doc.Path == "" || doc.SourceState != nil {
		return
	}
	var content []byte
	if doc.Dirty {
		content = s.latestSavedSource(doc.ID)
	} else {
		content, _ = os.ReadFile(s.DraftPath(doc))
	}
	if content == nil && !doc.Dirty {
		content, _ = os.ReadFile(doc.Path)
	}
	if content == nil {
		// A legacy dirty session without a saved/open history point cannot prove
		// what was on disk. Force a visible choice on its first save.
		doc.SourceState = &SourceState{}
		return
	}
	doc.SourceState = sourceStateForPath(doc.Path, content)
}

func (s *Store) latestSavedSource(docID string) []byte {
	dir := s.historyDir(docID)
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil
	}
	names := make([]string, 0, len(entries))
	for _, entry := range entries {
		if !entry.IsDir() && strings.HasSuffix(entry.Name(), snapshotSuffix) {
			names = append(names, entry.Name())
		}
	}
	sort.Sort(sort.Reverse(sort.StringSlice(names)))
	for _, name := range names {
		data, err := os.ReadFile(filepath.Join(dir, name))
		if err != nil {
			continue
		}
		var snapshot Snapshot
		if json.Unmarshal(data, &snapshot) != nil {
			continue
		}
		switch snapshot.Source {
		case "open", "save", "save-as", "external-reload":
			return []byte(snapshot.Content)
		}
	}
	return nil
}
