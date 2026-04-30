package preview

import (
	"strconv"
	"strings"
	"unicode"
)

type Kind int

const (
	Paragraph Kind = iota
	Heading
	Bullet
	Ordered
	Task
	Quote
	Code
	Table
	Rule
)

type Block struct {
	Kind    Kind
	Level   int
	Text    string
	Checked bool
}

func Parse(source string) []Block {
	lines := strings.Split(strings.ReplaceAll(source, "\r\n", "\n"), "\n")
	var blocks []Block
	var paragraph []string
	var code []string
	inCode := false

	flushParagraph := func() {
		if len(paragraph) == 0 {
			return
		}
		text := strings.Join(paragraph, " ")
		text = strings.Join(strings.Fields(text), " ")
		if text != "" {
			blocks = append(blocks, Block{Kind: Paragraph, Text: text})
		}
		paragraph = paragraph[:0]
	}

	for i := 0; i < len(lines); i++ {
		raw := lines[i]
		line := strings.TrimRight(raw, " \t")
		trim := strings.TrimSpace(line)

		if strings.HasPrefix(trim, "```") {
			if inCode {
				blocks = append(blocks, Block{Kind: Code, Text: strings.Join(code, "\n")})
				code = code[:0]
				inCode = false
			} else {
				flushParagraph()
				inCode = true
			}
			continue
		}
		if inCode {
			code = append(code, raw)
			continue
		}

		if trim == "" {
			flushParagraph()
			continue
		}
		if isRule(trim) {
			flushParagraph()
			blocks = append(blocks, Block{Kind: Rule})
			continue
		}
		if level, text := heading(trim); level > 0 {
			flushParagraph()
			blocks = append(blocks, Block{Kind: Heading, Level: level, Text: text})
			continue
		}
		if table, next, ok := table(lines, i); ok {
			flushParagraph()
			blocks = append(blocks, Block{Kind: Table, Text: table})
			i = next
			continue
		}
		if text, checked, ok := task(trim); ok {
			flushParagraph()
			blocks = append(blocks, Block{Kind: Task, Text: text, Checked: checked})
			continue
		}
		if text, ok := unordered(trim); ok {
			flushParagraph()
			blocks = append(blocks, Block{Kind: Bullet, Text: text})
			continue
		}
		if number, text, ok := ordered(trim); ok {
			flushParagraph()
			blocks = append(blocks, Block{Kind: Ordered, Level: number, Text: text})
			continue
		}
		if text, ok := quote(trim); ok {
			flushParagraph()
			blocks = append(blocks, Block{Kind: Quote, Text: text})
			continue
		}
		paragraph = append(paragraph, trim)
	}

	if inCode {
		blocks = append(blocks, Block{Kind: Code, Text: strings.Join(code, "\n")})
	}
	flushParagraph()
	return blocks
}

func heading(line string) (int, string) {
	level := 0
	for level < len(line) && level < 6 && line[level] == '#' {
		level++
	}
	if level == 0 || level >= len(line) || !unicode.IsSpace(rune(line[level])) {
		return 0, ""
	}
	return level, strings.TrimSpace(line[level:])
}

func unordered(line string) (string, bool) {
	if len(line) < 3 {
		return "", false
	}
	if (line[0] == '-' || line[0] == '*' || line[0] == '+') && unicode.IsSpace(rune(line[1])) {
		return strings.TrimSpace(line[2:]), true
	}
	return "", false
}

func task(line string) (string, bool, bool) {
	text, ok := unordered(line)
	if !ok || len(text) < 4 || text[0] != '[' || text[2] != ']' || !unicode.IsSpace(rune(text[3])) {
		return "", false, false
	}
	marker := text[1]
	if marker != ' ' && marker != 'x' && marker != 'X' {
		return "", false, false
	}
	return strings.TrimSpace(text[4:]), marker == 'x' || marker == 'X', true
}

func ordered(line string) (int, string, bool) {
	i := 0
	for i < len(line) && line[i] >= '0' && line[i] <= '9' {
		i++
	}
	if i == 0 || i+1 >= len(line) {
		return 0, "", false
	}
	if line[i] != '.' && line[i] != ')' {
		return 0, "", false
	}
	if !unicode.IsSpace(rune(line[i+1])) {
		return 0, "", false
	}
	n, err := strconv.Atoi(line[:i])
	if err != nil {
		return 0, "", false
	}
	return n, strings.TrimSpace(line[i+2:]), true
}

func quote(line string) (string, bool) {
	if !strings.HasPrefix(line, ">") {
		return "", false
	}
	return strings.TrimSpace(strings.TrimPrefix(line, ">")), true
}

func isRule(line string) bool {
	if len(line) < 3 {
		return false
	}
	first := line[0]
	if first != '-' && first != '*' && first != '_' {
		return false
	}
	count := 0
	for _, r := range line {
		if r == rune(first) {
			count++
			continue
		}
		if !unicode.IsSpace(r) {
			return false
		}
	}
	return count >= 3
}

func table(lines []string, start int) (string, int, bool) {
	if start+1 >= len(lines) {
		return "", start, false
	}
	header := strings.TrimSpace(lines[start])
	separator := strings.TrimSpace(lines[start+1])
	if !isTableRow(header) || !isTableSeparator(separator) {
		return "", start, false
	}
	rows := [][]string{splitTableRow(header)}
	i := start + 2
	for i < len(lines) {
		row := strings.TrimSpace(lines[i])
		if !isTableRow(row) {
			break
		}
		rows = append(rows, splitTableRow(row))
		i++
	}
	return formatTable(rows), i - 1, true
}

func isTableRow(line string) bool {
	return strings.Count(line, "|") >= 2
}

func isTableSeparator(line string) bool {
	if !isTableRow(line) {
		return false
	}
	for _, cell := range splitTableRow(line) {
		cell = strings.Trim(cell, ":- ")
		if cell != "" {
			return false
		}
	}
	return true
}

func splitTableRow(line string) []string {
	line = strings.TrimSpace(line)
	line = strings.TrimPrefix(line, "|")
	line = strings.TrimSuffix(line, "|")
	parts := strings.Split(line, "|")
	for i := range parts {
		parts[i] = strings.TrimSpace(parts[i])
	}
	return parts
}

func formatTable(rows [][]string) string {
	widths := make([]int, 0)
	for _, row := range rows {
		for i, cell := range row {
			if i == len(widths) {
				widths = append(widths, 0)
			}
			if len(cell) > widths[i] {
				widths[i] = len(cell)
			}
		}
	}
	var out strings.Builder
	for i, row := range rows {
		if i > 0 {
			out.WriteByte('\n')
		}
		for j, cell := range row {
			if j > 0 {
				out.WriteString("  ")
			}
			out.WriteString(cell)
			if pad := widths[j] - len(cell); pad > 0 {
				out.WriteString(strings.Repeat(" ", pad))
			}
		}
	}
	return out.String()
}
