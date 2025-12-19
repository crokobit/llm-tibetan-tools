import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './styles.css'

// Suppress react-quill's findDOMNode deprecation warning (library issue, not fixable from our side)
const originalError = console.error;
console.error = (...args) => {
    if (args[0]?.includes?.('findDOMNode is deprecated')) {
        return;
    }
    originalError.apply(console, args);
};

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>,
)
