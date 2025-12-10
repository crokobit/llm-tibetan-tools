# Tibetan LLM Tools

A React-based application for Tibetan language analysis and learning, powered by Google Gemini AI. This tool allows users to analyze Tibetan text, manage files, and leverage AI for linguistic insights.

## Features

*   **Tibetan Text Analysis**: Analyze Tibetan text with AI-powered insights.
*   **Google OAuth Login**: Secure user authentication using Google.
*   **Cloud Storage**: Save and retrieve your analysis files securely in the cloud (AWS).
*   **AI Integration**: Direct integration with Google Gemini 1.5 Flash for fast and accurate processing.

## Architecture

The project uses a hybrid architecture:
*   **Frontend**: React + Vite (Static SPA hosted on GitHub Pages).
*   **Backend**: AWS Serverless (Lambda, API Gateway, DynamoDB, S3).
*   **Infrastructure**: Managed via AWS CDK.

See [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed design documentation.

## Getting Started

### Prerequisites

*   Node.js (v18+)
*   AWS CLI (configured with credentials)
*   Google Cloud Project (for OAuth Client ID)

### 1. Backend Deployment (AWS)

The backend infrastructure is defined using AWS CDK.

1.  Navigate to the CDK directory:
    ```bash
    cd cdk
    ```

2.  Install dependencies:
    ```bash
    npm install
    ```

3.  Bootstrap your AWS environment (run once per region):
    ```bash
    npx cdk bootstrap
    ```

4.  Deploy the stack:
    ```bash
    npx cdk deploy
    ```

5.  **Note the API Gateway URL** from the output (e.g., `https://xyz.execute-api.us-east-1.amazonaws.com/`).

### 2. Frontend Configuration

1.  **Google Client ID**:
    *   Create a Web Application credential in Google Cloud Console.
    *   Add your local (`http://localhost:5173`) and production URLs to "Authorized JavaScript origins".
    *   Update `react-version/App.jsx`:
        ```javascript
        <GoogleOAuthProvider clientId="YOUR_ACTUAL_CLIENT_ID">
        ```

2.  **API URL**:
    *   Update `react-version/utils/api.js` (or use `.env`):
        ```javascript
        const API_BASE_URL = 'YOUR_API_GATEWAY_URL';
        ```

### 3. Running Locally

1.  Navigate to the project root:
    ```bash
    cd react-version
    ```

2.  Install dependencies:
    ```bash
    npm install
    ```

3.  Start the development server:
    ```bash
    npm run dev
    ```

## Deployment (Frontend)

The frontend is configured to deploy to GitHub Pages via GitHub Actions. Pushing to the `main` branch triggers the deployment workflow.
