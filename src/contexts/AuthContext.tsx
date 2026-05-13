import { createContext, useContext, useState, useEffect } from "react";
import { auth } from "@/lib/firebase";
import { onAuthStateChanged, type User, signOut as firebaseSignOut } from "firebase/auth";
import { db } from "@/lib/db";
import type { UserProfile } from "@/lib/types";

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
      // Mock auth for local fallback mode
      const localUser = localStorage.getItem("esdal_local_user");
      if (localUser) {
        const u = JSON.parse(localUser);
        setUser({ uid: u.id, email: u.email } as User);
        fetchProfile(u.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        await fetchProfile(u.uid);
      } else {
        setProfile(null);
      }
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
