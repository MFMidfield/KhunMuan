/**
 * Shared input styling for the configuration editors.
 *
 * In its own module rather than beside the components: a file that exports both
 * a component and a constant loses hot-reload for the whole file, and these
 * editors are exactly the screens worth iterating on quickly.
 */
export const fieldClass = [
  'min-h-11 rounded-btn border border-border-strong bg-surface px-3 text-ink',
  'placeholder:text-ink-muted',
].join(' ')
