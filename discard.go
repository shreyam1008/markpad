package main

// DiscardNote is called only after the frontend has completed its dirty-note
// confirmation flow. It removes recoverable draft content before closing the
// note so an explicit "Don't Save" decision is honored completely.
func (a *App) DiscardNote(noteID string) SessionState {
	a.contentMu.Lock()
	defer a.contentMu.Unlock()
	if a.sess == nil || a.store == nil {
		return SessionState{}
	}
	if doc := a.sess.Find(noteID); doc != nil {
		a.recordBackgroundError("delete discarded draft", a.store.RemoveDraft(doc))
	}
	return a.closeNoteLocked(noteID)
}
