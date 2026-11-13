declare global {
  interface Window {
    electronAPI: {
      googleSignIn(): Promise<{ idToken: string; accessToken: string }>;
    };
  }
}
export {};