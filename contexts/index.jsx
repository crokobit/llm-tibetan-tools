import { composeProviders } from './composeProviders.jsx';
import { DocumentProvider, useDocument } from './DocumentContext.jsx';
import { EditProvider, useEdit } from './EditContext.jsx';
import { SelectionProvider, useSelection } from './SelectionContext.jsx';

/**
 * Composed provider that wraps all context providers.
 * Use this single component in your App instead of nesting multiple providers.
 * 
 * Order matters! DocumentProvider must come first since EditProvider depends on it,
 * and SelectionProvider depends on both DocumentProvider and EditProvider.
 */
export const AppProviders = composeProviders(
    DocumentProvider,
    EditProvider,
    SelectionProvider
);

// Re-export hooks for convenience
export { useDocument, useEdit, useSelection };
