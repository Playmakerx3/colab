import { useEffect } from "react";
import { supabase } from "../supabase";
import { normalizeBannerPixels } from "../constants/appConstants";

export function useAuthBootstrap({
  setAuthUser,
  setProfile,
  setBannerPixels,
  setVerifyEmail,
  setScreen,
  setAuthLoading,
  loadAllData,
}) {
  useEffect(() => {
    const isEmailUnconfirmed = (user) => {
      if (!user) return false;
      const hasNoIdentities = Array.isArray(user.identities) && user.identities.length === 0;
      return hasNoIdentities || !user.email_confirmed_at;
    };

    const loadProfile = async (userId) => {
      const { data } = await supabase.from("profiles").select("*").eq("id", userId).single();
      if (data) {
        setProfile(data);
        if (data?.banner_pixels) {
          try {
            setBannerPixels(normalizeBannerPixels(JSON.parse(data.banner_pixels)));
          } catch (error) {
            console.warn("Failed to parse banner_pixels", error);
          }
        }
        setScreen("app");
        setAuthLoading(false);
        loadAllData(userId);
      } else {
        setScreen("onboard");
        setAuthLoading(false);
      }
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      setAuthUser(session?.user || null);
      if (session?.user) {
        if (isEmailUnconfirmed(session.user)) {
          setVerifyEmail(session.user.email || "");
          setScreen("verify");
          setAuthLoading(false);
          return;
        }
        loadProfile(session.user.id);
      } else setAuthLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") {
        setAuthUser(session?.user || null);
        setAuthLoading(false);
        setScreen("reset-password");
        return;
      }
      setAuthUser(session?.user || null);
      if (session?.user) {
        if (isEmailUnconfirmed(session.user)) {
          setVerifyEmail(session.user.email || "");
          setScreen("verify");
          setAuthLoading(false);
          return;
        }
        loadProfile(session.user.id);
      }
      else {
        setProfile(null);
        setVerifyEmail("");
        setAuthLoading(false);
        setScreen("landing");
      }
    });
    return () => subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
