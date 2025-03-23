// utils/profileStorage.js
// This utility manages saving and loading profiles

// Use browser localStorage for client-side storage
const saveProfile = async (profile) => {
    // Get existing profiles
    const profilesJson = localStorage.getItem('tvWallProfiles') || '{}';
    const profiles = JSON.parse(profilesJson);
    
    // Add new profile
    profiles[profile.name] = profile;
    
    // Save back to localStorage
    localStorage.setItem('tvWallProfiles', JSON.stringify(profiles));
    return true;
  };
  
  const loadProfile = async (profileName) => {
    const profilesJson = localStorage.getItem('tvWallProfiles') || '{}';
    const profiles = JSON.parse(profilesJson);
    
    return profiles[profileName] || null;
  };
  
  const getProfilesList = async () => {
    const profilesJson = localStorage.getItem('tvWallProfiles') || '{}';
    const profiles = JSON.parse(profilesJson);
    
    return Object.keys(profiles);
  };
  
  const deleteProfile = async (profileName) => {
    const profilesJson = localStorage.getItem('tvWallProfiles') || '{}';
    const profiles = JSON.parse(profilesJson);
    
    if (profiles[profileName]) {
      delete profiles[profileName];
      localStorage.setItem('tvWallProfiles', JSON.stringify(profiles));
      return true;
    }
    
    return false;
  };
  
  export { saveProfile, loadProfile, getProfilesList, deleteProfile };