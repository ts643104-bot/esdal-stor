import { createContext, useContext, useEffect, useState } from "react";
import { auth } from "@/lib/firebase";
import {
  onAuthStateChanged,
  signInAnonymously,
  type User,
  signOut as firebaseSignOut,
} from "firebase/auth";
import { db } from "@/lib/db";
import type { UserProfile } from "@/lib/types";

// High-security default:
// - In production, DO NOT trust localStorage-based "mock auth".
// - If Firebase Auth is available, ensure we always have an authenticated user (anonymous sign-in) to secure writes.
const ALLOW_LOCAL_MOCK_AUTH = Boolean((import.meta as any).env?.DEV);

type AuthContextType = {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (uid: string) => {
    const p = await db.getUserProfile(uid);
    setProfile(p);
  };

  useEffect(() => {
    if (!auth) {
      // DEV-only fallback for local testing (never rely on it in production)
      if (ALLOW_LOCAL_MOCK_AUTH) {
        const localUser = localStorage.getItem("esdal_local_user");
        if (localUser) {
          const u = JSON.parse(localUser);
          setUser({ uid: u.id, email: u.email } as User);
          fetchProfile(u.id).finally(() => setLoading(false));
          return;
        }
      }
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        // Remove automatic anonymous sign-in to enforce real email accounts
        setUser(null);
        setProfile(null);
        setLoading(false);
        return;
      }

      setUser(u);
      await fetchProfile(u.uid);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const logout = async () => {
    if (auth) {
      await firebaseSignOut(auth);
    } else {
      localStorage.removeItem("esdal_local_user");
      setUser(null);
      setProfile(null);
    }
  };

  const refreshProfile = async () => {
    if (user) {
      await fetchProfile(user.uid);
    }
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, logout, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
