import { supabase } from "../../../supabase";
import { geocodeLocation } from "../../../utils/geohash";

export const loadCurrentUserProfile = async (userId) => {
  return supabase.from("profiles").select("*").eq("id", userId).single();
};

export const saveProfile = async (userId, profile) => {
  const payload = {
    name: profile.name,
    username: profile.username,
    role: profile.role,
    bio: profile.bio,
    skills: profile.skills,
    location: profile.location || "",
  };

  if (profile.location) {
    const geo = await geocodeLocation(profile.location);
    if (geo) {
      payload.location_geohash = geo.geohash;
      payload.location_lat     = geo.lat;
      payload.location_lng     = geo.lng;
    }
  }

  return supabase.from("profiles").update(payload).eq("id", userId).select().single();
};

export const saveBannerPixels = async (userId, pixels) => {
  const pixelStr = JSON.stringify(pixels);
  await supabase.from("profiles").update({ banner_pixels: pixelStr }).eq("id", userId);
  return pixelStr;
};

export const createPortfolioItem = async (userId, item) => {
  return supabase.from("portfolio_items").insert({
    user_id: userId,
    ...item,
  }).select().single();
};

export const updatePortfolioItem = async (id, item) => {
  return supabase.from("portfolio_items").update(item).eq("id", id).select().single();
};

export const deletePortfolioItem = async (id) => {
  return supabase.from("portfolio_items").delete().eq("id", id);
};
