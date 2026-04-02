export const signUpWithEmailPassword = (supabaseClient, email, password) => {
  return supabaseClient.auth.signUp({ email, password });
};

export const signInWithEmailPassword = (supabaseClient, email, password) => {
  return supabaseClient.auth.signInWithPassword({ email, password });
};

export const sendPasswordResetEmail = (supabaseClient, email, redirectTo) => {
  return supabaseClient.auth.resetPasswordForEmail(email, { redirectTo });
};

export const signOutCurrentUser = (supabaseClient) => {
  return supabaseClient.auth.signOut();
};
