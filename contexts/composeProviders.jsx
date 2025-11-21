import React from 'react';

/**
 * Composes multiple provider components into a single provider using functional composition.
 * This eliminates the need for deeply nested provider structures in your App component.
 * 
 * @param {...React.ComponentType} providers - Provider components to compose
 * @returns {React.ComponentType} A single composed provider component
 * 
 * @example
 * const AppProviders = composeProviders(
 *   DocumentProvider,
 *   EditProvider,
 *   SelectionProvider
 * );
 * 
 * // Usage in App:
 * <AppProviders>
 *   <YourApp />
 * </AppProviders>
 */
export function composeProviders(...providers) {
    return ({ children }) => {
        return providers.reduceRight(
            (acc, Provider) => <Provider>{acc}</Provider>,
            children
        );
    };
}
