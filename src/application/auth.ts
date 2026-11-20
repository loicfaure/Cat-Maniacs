import { GoogleAuthProvider, signInWithCredential, signOut } from 'firebase/auth';
import { auth } from '../firebase';

async function signInWithGoogle() {
  const { idToken, accessToken } = await window.electronAPI.googleSignIn();
  const credential = GoogleAuthProvider.credential(idToken, accessToken);
  return signInWithCredential(auth, credential);
}

export async function ensureSignedIn() {
  await auth.authStateReady();            // wait for Firebase to restore a saved session
  if (auth.currentUser) {
    return auth.currentUser
  };

  await signInWithGoogle();               
  return auth.currentUser!;
}

export async function reauthenticate() {
  await signOut(auth);
  return await ensureSignedIn();
}

export const logout = () => signOut(auth);