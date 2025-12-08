# System Architecture: Tibetan LLM Tools

This document details the architecture for the Tibetan LLM Tools application. The system is designed as a client-side static application hosted on GitHub Pages, leveraging browser-based APIs and direct calls to AI services where applicable.

## High-Level Architecture

The application follows a modern static web architecture:
1.  **Presentation Layer**: Static single-page application (SPA) built with React and Vite.
2.  **Hosting**: GitHub Pages.
3.  **CI/CD**: GitHub Actions for automated building and deployment.
4.  **AI Integration**: Direct integration with Google Gemini API (client-side).

### Architecture Diagram

```mermaid
flowchart TD

    %% ===== Client Layer =====
    subgraph Client_Layer["Client Layer"]
        User[User Browser]
    end

    %% ===== Hosting =====
    subgraph Hosting["Hosting Provider"]
        GHPages[GitHub Pages]
    end

    %% ===== External Services =====
    subgraph External_Services["External Services"]
        Gemini["Google Gemini API<br>(Gemini 1.5 Flash)"]
    end

    %% ===== Flows =====
    User -->|HTTPS Request| GHPages
    GHPages -->|Serve Static Assets| User
    
    User -->|API Calls (Direct)| Gemini

```

---

## Component Details

### 1. Frontend (Presentation Layer)
*   **Technology**: React 18, Vite.
*   **Hosting**: **GitHub Pages**.
*   **Deployment**: Automated via **GitHub Actions**.
*   **State Management**: React Context API (`SelectionContext`).

### 2. AI Integration
*   **Service**: **Google Gemini API** (Gemini 1.5 Flash).
*   **Integration Pattern**: Direct client-side calls using the Google Generative AI SDK.
*   **Configuration**: API Key is managed via user input or local storage (to be implemented/verified).

### 3. Infrastructure & Deployment
*   **Platform**: GitHub Pages.
*   **CI/CD**: GitHub Actions workflow (`.github/workflows/deploy.yml`).
    *   Triggers on push to `main`.
    *   Builds the Vite project.
    *   Deploys the `dist` folder to the `gh-pages` environment.

## Security Considerations
*   **API Keys**: Since the application is client-side, care must be taken with API keys. Users may need to provide their own keys, or keys should be proxied if a backend is reintroduced. Currently, the architecture assumes a client-side model.

## Scalability
*   **Static Hosting**: GitHub Pages handles static asset scaling automatically.
*   **Client-Side Compute**: Processing is offloaded to the user's device and the external AI API.
