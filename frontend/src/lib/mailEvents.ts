/** Fired after a new note is saved, so the envelope animation and your globe pin can react. */
export const SEALED = 'mailbuds:sealed'
export const announceSealed = () => window.dispatchEvent(new Event(SEALED))
