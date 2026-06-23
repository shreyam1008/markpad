package main

import (
	"errors"
	"os"
	"path/filepath"
	"strconv"
	"time"
)

func (a *App) CreateLocalFolderDailyNote() (SessionState, error) {
	root := a.GetLocalFolder()
	if root.Path == "" || root.Missing {
		return a.GetSession(), errors.New("local folder is not set")
	}
	now := time.Now()
	path := filepath.Join(root.Path, "Daily", now.Format("2006-01-02")+".md")
	content := "# " + now.Format("Monday, January 2, 2006") + "\n\n" +
		"## Focus\n" +
		"- [ ] \n\n" +
		"## Notes\n\n" +
		"## Log\n\n"
	return a.createLocalTemplateNote(path, content)
}

func (a *App) CreateLocalFolderWeeklyNote() (SessionState, error) {
	root := a.GetLocalFolder()
	if root.Path == "" || root.Missing {
		return a.GetSession(), errors.New("local folder is not set")
	}
	year, week := time.Now().ISOWeek()
	key := strconv.Itoa(year) + "-W" + localTemplateTwoDigit(week)
	path := filepath.Join(root.Path, "Weekly", key+".md")
	content := "# " + key + "\n\n" +
		"## Outcomes\n" +
		"- [ ] \n\n" +
		"## Tasks\n" +
		"- [ ] \n\n" +
		"## Notes\n\n" +
		"## Review\n\n"
	return a.createLocalTemplateNote(path, content)
}

func (a *App) createLocalTemplateNote(path string, content string) (SessionState, error) {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return a.GetSession(), err
	}
	if _, err := os.Stat(path); errors.Is(err, os.ErrNotExist) {
		if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
			return a.GetSession(), err
		}
	} else if err != nil {
		return a.GetSession(), err
	}
	return a.openPath(path)
}

func localTemplateTwoDigit(n int) string {
	if n < 10 {
		return "0" + strconv.Itoa(n)
	}
	return strconv.Itoa(n)
}
