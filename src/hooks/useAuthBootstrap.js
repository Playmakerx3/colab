import { useEffect } from "react";

export default function useAuthBootstrap({
  supabase,
  setAuthUser,
  setProfile,
  setBannerPixels,
  setScreen,
  setAuthLoading,
  loadAllData,
}) {
  useEffect(() => {
    const loadProfile = async (userId) => {
      const { data } = await supabase.from("profiles").select("*").eq("id", userId).single();
      if (data) {
        setProfile(data);
        if (data?.banner_pixels) {
          try {
            setBannerPixels(JSON.parse(data.banner_pixels));
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
      if (session?.user) loadProfile(session.user.id);
      else setAuthLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthUser(session?.user || null);
      if (session?.user) loadProfile(session.user.id);
      else {
        setProfile(null);
        setAuthLoading(false);
        setScreen("landing");
      }
    });

    return () => subscription.unsubscribe();
  }, [
    supabase,
    setAuthUser,
    setProfile,
    setBannerPixels,
    setScreen,
    setAuthLoading,
    loadAllData,
  ]);
}
