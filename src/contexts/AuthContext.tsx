import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  theme: 'light' | 'dark';
  fullName: string;
  favoriteCity: string;
  setTheme: (t: 'light' | 'dark') => void;
  setFullName: (n: string) => void;
  setFavoriteCity: (c: string) => void;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, name: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [theme, setThemeState] = useState<'light' | 'dark'>('light');
  const [fullName, setFullNameState] = useState('');
  const [favoriteCity, setFavoriteCityState] = useState('');

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      if (data.session?.user) {
        loadProfile(data.session.user.id);
      }
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      (async () => {
        setSession(sess);
        setUser(sess?.user ?? null);
        if (sess?.user) {
          await loadProfile(sess.user.id);
        } else {
          setFullNameState('');
          setFavoriteCityState('');
          setThemeState('light');
        }
      })();
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  async function loadProfile(userId: string) {
    const { data } = await supabase
      .from('user_profiles')
      .select('full_name, theme_preference, favorite_city')
      .eq('id', userId)
      .maybeSingle();

    if (data) {
      setFullNameState(data.full_name ?? '');
      setThemeState(data.theme_preference ?? 'light');
      setFavoriteCityState(data.favorite_city ?? '');
    }
  }

  async function setTheme(t: 'light' | 'dark') {
    setThemeState(t);
    if (user) {
      await supabase
        .from('user_profiles')
        .update({ theme_preference: t, updated_at: new Date().toISOString() })
        .eq('id', user.id);
    }
  }

  async function setFullName(n: string) {
    setFullNameState(n);
    if (user) {
      await supabase
        .from('user_profiles')
        .update({ full_name: n, updated_at: new Date().toISOString() })
        .eq('id', user.id);
    }
  }

  async function setFavoriteCity(c: string) {
    setFavoriteCityState(c);
    if (user) {
      await supabase
        .from('user_profiles')
        .update({ favorite_city: c, updated_at: new Date().toISOString() })
        .eq('id', user.id);
    }
  }

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  }

  async function signUp(email: string, password: string, name: string) {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) return { error: error.message };
    if (data.user) {
      await supabase.from('user_profiles').insert({
        id: data.user.id,
        full_name: name,
        theme_preference: 'light',
      });
    }
    return { error: null };
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        theme,
        fullName,
        favoriteCity,
        setTheme,
        setFullName,
        setFavoriteCity,
        signIn,
        signUp,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
