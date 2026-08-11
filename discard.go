package main

// DiscardNote is called only after the frontend has completed its dirty-note
// confirmation flow. It removes recoverable draft content before closing the
// note so an explicit "Don't Save" decision is honored completely.
func (a *App) DiscardNote(noteID string) SessionState {
	if a.sess == nil || a.store == nil {
		return a.GetSession()
	}
	if doc := a.sess.Find(noteID); doc != nil {
		a.recordBackgroundError("delete discarded draft", a.store.RemoveDraft(doc))
	}
	return a.CloseNote(noteID)
}
