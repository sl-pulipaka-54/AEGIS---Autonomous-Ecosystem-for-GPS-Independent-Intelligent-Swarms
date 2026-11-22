import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  type User,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json' with { type: 'json' };

export const SCOPES = [
  'https://mail.google.com/',
  'https://www.googleapis.com/auth/gmail.addons.current.action.compose',
  'https://www.googleapis.com/auth/gmail.addons.current.message.action',
  'https://www.googleapis.com/auth/gmail.addons.current.message.metadata',
  'https://www.googleapis.com/auth/gmail.addons.current.message.readonly',
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/gmail.insert',
  'https://www.googleapis.com/auth/gmail.labels',
  'https://www.googleapis.com/auth/gmail.metadata',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.settings.basic',
  'https://www.googleapis.com/auth/gmail.settings.sharing',
] as const;

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleAuthProvider = new GoogleAuthProvider();

for (const scope of SCOPES) {
  googleAuthProvider.addScope(scope);
}

// In-memory Gmail OAuth access token cache (never stored in localStorage/sessionStorage)
let isSigningInGmail = false;
let cachedGmailAccessToken: string | null = null;

export function initGmailAuth(
  onAuthSuccess?: (user: User, accessToken: string) => void,
  onAuthFailure?: () => void
) {
  return onAuthStateChanged(auth, (user) => {
    if (user) {
      if (cachedGmailAccessToken) {
        onAuthSuccess?.(user, cachedGmailAccessToken);
      } else if (!isSigningInGmail) {
        cachedGmailAccessToken = null;
        onAuthFailure?.();
      }
    } else {
      cachedGmailAccessToken = null;
      onAuthFailure?.();
    }
  });
}

export async function connectGmailWithGoogle(): Promise<{
  user: User;
  idToken: string;
  accessToken: string;
}> {
  try {
    isSigningInGmail = true;
    const result = await signInWithPopup(auth, googleAuthProvider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Failed to obtain Gmail access token from Google Sign-In');
    }
    const idToken = await result.user.getIdToken();
    cachedGmailAccessToken = credential.accessToken;
    return {
      user: result.user,
      idToken,
      accessToken: cachedGmailAccessToken,
    };
  } finally {
    isSigningInGmail = false;
  }
}

export function getGmailAccessToken(): string | null {
  return cachedGmailAccessToken;
}

export function setGmailAccessToken(token: string | null) {
  cachedGmailAccessToken = token;
}

export function clearGmailAccessToken() {
  cachedGmailAccessToken = null;
}

