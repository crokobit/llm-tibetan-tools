import React, { createContext, useContext, useState, useEffect } from 'react';
import { googleLogout, useGoogleLogin } from '@react-oauth/google';
import { jwtDecode } from "jwt-decode";

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [token, setToken] = useState(null);
    const [refreshHandle, setRefreshHandle] = useState(null);

    // Check for existing token in localStorage on mount
    useEffect(() => {
        const storedToken = localStorage.getItem('google_token');
        const storedUser = localStorage.getItem('google_user');
        const storedHandle = localStorage.getItem('google_refresh_handle');
        const storedExpiresAt = localStorage.getItem('google_token_expires_at');

        if (storedToken && storedUser) {
            setToken(storedToken);
            setUser(JSON.parse(storedUser));
            if (storedHandle) setRefreshHandle(storedHandle);
        }
    }, []);

    const signIn = useGoogleLogin({
        flow: 'auth-code',
        onSuccess: async (codeResponse) => {
            try {
                // Exchange code for tokens via our backend
                const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://so6gk7vxuj.execute-api.us-east-1.amazonaws.com';

                const response = await fetch(`${API_BASE_URL}/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ code: codeResponse.code })
                });

                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    throw new Error(errorData.error || `Login failed with status ${response.status}`);
                }

                const data = await response.json();

                setToken(data.access_token);
                setUser(data.user);
                setRefreshHandle(data.refresh_handle);

                localStorage.setItem('google_token', data.access_token);
                localStorage.setItem('google_user', JSON.stringify(data.user));
                if (data.refresh_handle) {
                    localStorage.setItem('google_refresh_handle', data.refresh_handle);
                }

                // Store expiration
                const expiresAt = Date.now() + (data.expires_in * 1000);
                localStorage.setItem('google_token_expires_at', expiresAt);

            } catch (error) {
                console.error("Login error", error);
                alert('Login failed. Please try again.');
            }
        },
        onError: error => console.log('Login Failed:', error)
    });

    const refreshSession = async () => {
        if (!refreshHandle) throw new Error('No refresh handle available');

        const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://so6gk7vxuj.execute-api.us-east-1.amazonaws.com';
        const response = await fetch(`${API_BASE_URL}/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh_handle: refreshHandle })
        });

        if (!response.ok) {
            throw new Error('Refresh failed');
        }

        const data = await response.json();
        setToken(data.access_token);
        localStorage.setItem('google_token', data.access_token);

        const expiresAt = Date.now() + (data.expires_in * 1000);
        localStorage.setItem('google_token_expires_at', expiresAt);

        return data.access_token;
    };

    const logout = () => {
        googleLogout();
        setUser(null);
        setToken(null);
        setRefreshHandle(null);
        localStorage.removeItem('google_token');
        localStorage.removeItem('google_user');
        localStorage.removeItem('google_token_expires_at');
        localStorage.removeItem('google_refresh_handle');
    };

    return (
        <AuthContext.Provider value={{ user, token, signIn, logout, refreshSession }}>
            {children}
        </AuthContext.Provider>
    );
};
