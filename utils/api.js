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

export const getJob = async (token, jobId) => {
    const response = await fetch(`${API_BASE_URL}/job/${jobId}`, {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${token}`
        }
    });

    if (response.status === 401) {
        throw new Error('Unauthorized');
    }

    if (!response.ok) {
        throw new Error('Failed to get job status');
    }

    return response.json();
};

export const deleteFile = async (token, filename) => {
    const response = await fetch(`${API_BASE_URL}/delete?filename=${encodeURIComponent(filename)}`, {
        method: 'DELETE',
        headers: {
            'Authorization': `Bearer ${token}`
        }
    });

    if (response.status === 401) {
        throw new Error('Unauthorized');
    }

    if (!response.ok) {
        throw new Error('Failed to delete file');
    }

    return response.json();
};

export const renameFile = async (token, filename, newFilename) => {
    const response = await fetch(`${API_BASE_URL}/rename`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ filename, newFilename })
    });

    if (response.status === 401) {
        throw new Error('Unauthorized');
    }

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to rename file');
    }

    return response.json();
};

export const disambiguateVerbs = async (token, text, items) => {
    const response = await fetch(`${API_BASE_URL}/disambiguate`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ text, items })
    });

    if (response.status === 401) {
        throw new Error('Unauthorized');
    }

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to disambiguate verbs');
    }

    return response.json();
};
