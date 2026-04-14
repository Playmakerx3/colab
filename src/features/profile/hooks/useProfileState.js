import {
  createPortfolioItem,
  deletePortfolioItem,
  loadCurrentUserProfile,
  saveBannerPixels,
  saveProfile,
} from "../services/profileService";
import { normalizeBannerPixels } from "../../../constants/appConstants";

export function useProfileState({
  authUser,
  profile,
  portfolioItems,
  newPortfolioItem,
  setProfile,
  setEditProfile,
  setPortfolioItems,
  setNewPortfolioItem,
  setShowAddPortfolio,
  setBannerPixels,
  showToast,
}) {
  const handleSaveProfile = async () => {
    const { data, error } = await saveProfile(authUser.id, profile);
    if (!error) {
      setProfile(data);
      setEditProfile(false);
      showToast("Profile saved.");
    }
  };

  const saveBanner = async (pixels) => {
    const normalizedPixels = normalizeBannerPixels(pixels);
    const pixelStr = await saveBannerPixels(authUser.id, normalizedPixels);
    setProfile(prev => ({ ...prev, banner_pixels: pixelStr }));
    setBannerPixels(normalizedPixels);
    showToast("Banner saved.");
  };

  const handleAddPortfolioItem = async () => {
    if (!newPortfolioItem.title) return;
    const { data } = await createPortfolioItem(authUser.id, newPortfolioItem);
    if (data) {
      setPortfolioItems([...portfolioItems, data]);
      setNewPortfolioItem({ title: "", description: "", url: "" });
      setShowAddPortfolio(false);
      showToast("Portfolio item added.");
    }
  };

  const handleDeletePortfolioItem = async (id) => {
    await deletePortfolioItem(id);
    setPortfolioItems(portfolioItems.filter(p => p.id !== id));
    showToast("Removed.");
  };

  const loadProfile = async (userId = authUser?.id) => {
    if (!userId) return null;
    const { data } = await loadCurrentUserProfile(userId);
    if (data) {
      setProfile(data);
      if (data?.banner_pixels) {
        try {
          setBannerPixels(normalizeBannerPixels(JSON.parse(data.banner_pixels)));
        } catch (error) {
          console.warn("Failed to parse banner_pixels", error);
        }
      }
    }
    return data;
  };

  return {
    handleSaveProfile,
    saveBanner,
    handleAddPortfolioItem,
    handleDeletePortfolioItem,
    loadProfile,
  };
}
