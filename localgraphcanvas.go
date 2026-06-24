package main

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
)

const (
	localGraphFileLimit = 120
	localGraphEdgeLimit = 220
	localGraphNodeLimit = 120
)

type localGraphCanvasDoc struct {
	Type     string                    `json:"type"`
	Version  int                       `json:"version"`
	Schema   string                    `json:"schema"`
	Source   string                    `json:"source"`
	Meta     *localGraphCanvasMeta     `json:"meta,omitempty"`
	Elements []localGraphCanvasElement `json:"elements"`
	AppState map[string]string         `json:"appState"`
	Files    map[string]any            `json:"files"`
}

type localGraphCanvasMeta struct {
	Format    string `json:"format,omitempty"`
	Generator string `json:"generator,omitempty"`
}

type localGraphCanvasElement struct {
	ID     string `json:"id"`
	Type   string `json:"type"`
	X      int    `json:"x"`
	Y      int    `json:"y"`
	W      int    `json:"w,omitempty"`
	H      int    `json:"h,omitempty"`
	Stroke string `json:"stroke,omitempty"`
	Width  int    `json:"width,omitempty"`
	Text   string `json:"text,omitempty"`
	Size   int    `json:"size,omitempty"`
}

type localGraphNode struct {
	id    string
	label string
	kind  string
	x     int
	y     int
}

type localGraphEdge struct {
	from string
	to   string
}

func (a *App) CreateLocalFolderLinksCanvas(limit int) (SessionState, error) {
	root := a.GetLocalFolder()
	if root.Path == "" || root.Missing {
		return a.GetSession(), errors.New("local folder is not set")
	}
	if limit <= 0 || limit > localGraphFileLimit {
		limit = localGraphFileLimit
	}
	nodes, edges := localGraphCollect(root.Path, limit)
	doc := localGraphBuildCanvas(nodes, edges)
	data, err := json.MarshalIndent(doc, "", "  ")
	if err != nil {
		return a.GetSession(), err
	}
	path := localCollisionPath(filepath.Join(root.Path, "Local Links"+markpadCanvasExtension))
	if err := os.WriteFile(path, append(data, '\n'), 0o644); err != nil {
		return a.GetSession(), err
	}
	return a.openPath(path)
}

func localGraphCollect(root string, limit int) (map[string]*localGraphNode, []localGraphEdge) {
	nodes := make(map[string]*localGraphNode)
	edgeSeen := make(map[string]bool)
	edges := make([]localGraphEdge, 0, localGraphEdgeLimit)
	scanned := 0
	_ = filepath.WalkDir(root, func(path string, entry os.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		if entry.IsDir() {
			if shouldSkipLocalDir(entry.Name()) && path != root {
				return filepath.SkipDir
			}
			return nil
		}
		if scanned >= limit || len(edges) >= localGraphEdgeLimit || len(nodes) >= localGraphNodeLimit {
			return filepath.SkipAll
		}
		if !localLinksMarkdown(path) {
			return nil
		}
		info, err := entry.Info()
		if err != nil || info.Size() > localLinksReadCap {
			return nil
		}
		scanned++
		sourceRel := localLinksRel(root, path)
		sourceID := "file:" + sourceRel
		localGraphEnsureNode(nodes, sourceID, sourceRel, "file")
		localGraphScanSource(path, sourceID, nodes, &edges, edgeSeen)
		return nil
	})
	return nodes, edges
}

func localGraphScanSource(path string, sourceID string, nodes map[string]*localGraphNode, edges *[]localGraphEdge, edgeSeen map[string]bool) {
	data, err := os.ReadFile(path)
	if err != nil {
		return
	}
	inFence := false
	fenceMarker := ""
	for _, line := range strings.Split(string(data), "\n") {
		trimmed := strings.TrimSpace(line)
		if strings.HasPrefix(trimmed, "```") || strings.HasPrefix(trimmed, "~~~") {
			marker := trimmed[:3]
			if !inFence {
				inFence = true
				fenceMarker = marker
			} else if marker == fenceMarker {
				inFence = false
				fenceMarker = ""
			}
			continue
		}
		if inFence {
			continue
		}
		for _, hit := range localLinksFromLine(line) {
			target := localLinksNormalizeTarget(hit.target)
			if target == "" || !localLinksLocalTarget(target) {
				continue
			}
			targetID := "target:" + strings.ToLower(target)
			localGraphEnsureNode(nodes, targetID, target, hit.kind)
			key := sourceID + "\x00" + targetID
			if edgeSeen[key] || len(*edges) >= localGraphEdgeLimit {
				continue
			}
			edgeSeen[key] = true
			*edges = append(*edges, localGraphEdge{from: sourceID, to: targetID})
		}
	}
}

func localGraphEnsureNode(nodes map[string]*localGraphNode, id string, label string, kind string) {
	if len(nodes) >= localGraphNodeLimit {
		return
	}
	if _, ok := nodes[id]; ok {
		return
	}
	nodes[id] = &localGraphNode{id: id, label: label, kind: kind}
}

func localGraphBuildCanvas(nodes map[string]*localGraphNode, edges []localGraphEdge) localGraphCanvasDoc {
	ordered := make([]*localGraphNode, 0, len(nodes))
	for _, node := range nodes {
		ordered = append(ordered, node)
	}
	sort.SliceStable(ordered, func(i, j int) bool {
		if ordered[i].kind == ordered[j].kind {
			return strings.ToLower(ordered[i].label) < strings.ToLower(ordered[j].label)
		}
		return ordered[i].kind < ordered[j].kind
	})
	for index, node := range ordered {
		col := index % 3
		row := index / 3
		node.x = col * 360
		node.y = row * 150
	}
	elements := make([]localGraphCanvasElement, 0, len(ordered)*2+len(edges))
	if len(ordered) == 0 {
		elements = append(elements,
			localGraphCanvasElement{ID: "note-0", Type: "rect", X: 0, Y: 0, W: 360, H: 120, Stroke: "#6b6e68", Width: 2},
			localGraphCanvasElement{ID: "note-1", Type: "text", X: 18, Y: 40, Text: "No local Markdown links found", Stroke: "#2f6f61", Size: 18},
		)
	} else {
		for index, node := range ordered {
			stroke := "#6b6e68"
			if node.kind == "wiki" {
				stroke = "#2f6f61"
			} else if node.kind == "markdown" {
				stroke = "#8a6b2f"
			}
			elements = append(elements,
				localGraphCanvasElement{ID: "node-" + strconv.Itoa(index), Type: "rect", X: node.x, Y: node.y, W: 280, H: 92, Stroke: stroke, Width: 2},
				localGraphCanvasElement{ID: "label-" + strconv.Itoa(index), Type: "text", X: node.x + 16, Y: node.y + 35, Text: localGraphShortLabel(node.label), Stroke: stroke, Size: 16},
			)
		}
		for index, edge := range edges {
			from := nodes[edge.from]
			to := nodes[edge.to]
			if from == nil || to == nil {
				continue
			}
			x1 := from.x + 140
			y1 := from.y + 46
			x2 := to.x + 140
			y2 := to.y + 46
			elements = append(elements, localGraphCanvasElement{
				ID: "edge-" + strconv.Itoa(index), Type: "arrow",
				X: x1, Y: y1, W: x2 - x1, H: y2 - y1,
				Stroke: "#2f6f61", Width: 2,
			})
		}
	}
	return localGraphCanvasDoc{
		Type:     "markpad-canvas",
		Version:  1,
		Schema:   "https://markpad.local/schemas/canvas-v1.json",
		Source:   "markpad-local-links",
		Meta: &localGraphCanvasMeta{
			Format:    "markpad-canvas-v1",
			Generator: "markpad-local-links",
		},
		Elements: elements,
		AppState: map[string]string{"viewBackgroundColor": "#ffffff"},
		Files:    map[string]any{},
	}
}

func localGraphShortLabel(label string) string {
	label = strings.TrimSpace(label)
	if len(label) <= 42 {
		return label
	}
	return label[:39] + "..."
}
