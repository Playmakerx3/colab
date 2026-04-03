import { supabase } from "../supabase";

export const signUp = ({ email, password }) => supabase.auth.signUp({ email, password });

export const signIn = ({ email, password }) => supabase.auth.signInWithPassword({ email, password });

export const resetPassword = ({ email, redirectTo }) => supabase.auth.resetPasswordForEmail(email, { redirectTo });

export const signOut = () => supabase.auth.signOut();
