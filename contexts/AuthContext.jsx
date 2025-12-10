import React, { createContext, useContext, useState, useEffect } from 'react';
import { googleLogout, useGoogleLogin } from '@react-oauth/google';
import { jwtDecode } from "jwt-decode";

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [token, setToken] = useState(null);

    // Check for existing token in localStorage on mount
    useEffect(() => {
        const storedToken = localStorage.getItem('google_token');
        const storedUser = localStorage.getItem('google_user');
        if (storedToken && storedUser) {
            setToken(storedToken);
            setUser(JSON.parse(storedUser));
        }
    }, []);

    const signIn = useGoogleLogin({
        onSuccess: async (tokenResponse) => {
            setToken(tokenResponse.access_token);
            localStorage.setItem('google_token', tokenResponse.access_token);

            try {
                const userInfo = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                    headers: { Authorization: `Bearer ${tokenResponse.access_token}` },
                }).then(res => res.json());

                setUser(userInfo);
                localStorage.setItem('google_user', JSON.stringify(userInfo));
            } catch (error) {
                console.error("Failed to fetch user info", error);
            }
        },
        onError: error => console.log('Login Failed:', error)
    });

    const logout = () => {
        googleLogout();
        setUser(null);
        setToken(null);
        localStorage.removeItem('google_token');
        localStorage.removeItem('google_user');
    };

    return (
        <AuthContext.Provider value={{ user, token, signIn, logout }}>
            {children}
        </AuthContext.Provider>
    );
};
