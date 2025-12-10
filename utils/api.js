const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://so6gk7vxuj.execute-api.us-east-1.amazonaws.com';

export const saveFile = async (token, filename, content) => {
    const response = await fetch(`${API_BASE_URL}/save`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ filename, content })
    });

    if (response.status === 401) {
        throw new Error('Unauthorized');
    }

    if (!response.ok) {
        throw new Error('Failed to save file');
    }

    return response.json();
};

export const listFiles = async (token) => {
    const response = await fetch(`${API_BASE_URL}/list`, {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${token}`
        }
    });

    if (response.status === 401) {
        throw new Error('Unauthorized');
    }

    if (!response.ok) {
        throw new Error('Failed to list files');
    }

    return response.json();
};

export const getFile = async (token, filename) => {
    const response = await fetch(`${API_BASE_URL}/get?filename=${encodeURIComponent(filename)}`, {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${token}`
        }
    });

    if (response.status === 401) {
        throw new Error('Unauthorized');
    }

    if (!response.ok) {
        throw new Error('Failed to get file');
    }

    return response.json();
};

export const analyzeText = async (token, text) => {
    const response = await fetch(`${API_BASE_URL}/analyze`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ text })
    });

    if (response.status === 401) {
        throw new Error('Unauthorized');
    }

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to analyze text');
    }

    return response.json();
};
