import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import type { StaffRole } from "@gtb/shared";
import { supabase } from "@/lib/supabase";
import { fetchMe, type MeResponse } from "@/lib/api";
import { env } from "@/lib/env";

export type AppUser = NonNullable<MeResponse["user"]>;

interface AuthContextValue {
  session: Session | null;
  user: AppUser | null;
  /** loading while we resolve the session + profile */
  loading: boolean;
  /** authenticated with Supabase but no matching GTB user row */
  unprovisioned: boolean;
  role: StaffRole | "client" | null;
  isStaff: boolean;
  isClient: boolean;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  refetchUser: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [sessionReady, setSessionReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setSessionReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      // Drop cached profile + data on sign-out / user switch.
      if (!next) queryClient.clear();
    });
    return () => sub.subscription.unsubscribe();
  }, [queryClient]);

  const {
    data: user,
    isLoading: userLoading,
    refetch,
  } = useQuery({
    queryKey: ["me", session?.user.id],
    queryFn: fetchMe,
    enabled: env.configured && Boolean(session),
    staleTime: 5 * 60_000,
  });

  const value = useMemo<AuthContextValue>(() => {
    const appUser = user ?? null;
    const role = (appUser?.role as StaffRole | "client" | undefined) ?? null;
    return {
      session,
      user: appUser,
      loading: !sessionReady || (Boolean(session) && userLoading),
      unprovisioned: Boolean(session) && !userLoading && !appUser,
      role,
      isStaff: role !== null && role !== "client",
      isClient: role === "client",
      signIn: async (email, password) => {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        return error ? { error: error.message } : {};
      },
      signOut: async () => {
        await supabase.auth.signOut();
      },
      refetchUser: () => void refetch(),
    };
  }, [session, sessionReady, user, userLoading, refetch]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
