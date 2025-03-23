import { useState } from 'react';

const SaveLoadPanel = ({ profiles, currentProfile, onSave, onLoad }) => {
  const [newProfileName, setNewProfileName] = useState('');
  
  const handleSave = () => {
    if (newProfileName.trim()) {
      onSave(newProfileName.trim());
      setNewProfileName('');
    }
  };
  
  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <h2 className="text-lg font-semibold mb-3">Profiles</h2>
      
      <div className="mb-4">
        <div className="flex gap-2">
          <input
            type="text"
            value={newProfileName}
            onChange={(e) => setNewProfileName(e.target.value)}
            placeholder="Profile name"
            className="flex-1 px-3 py-2 bg-gray-700 rounded-md text-white placeholder-gray-400"
          />
          <button
            onClick={handleSave}
            className="px-3 py-2 bg-green-600 hover:bg-green-700 rounded-md transition-colors"
          >
            Save
          </button>
        </div>
      </div>
      
      <div className="space-y-2 max-h-48 overflow-y-auto">
        {profiles.length === 0 ? (
          <p className="text-gray-400 text-sm">No saved profiles</p>
        ) : (
          profiles.map((profile) => (
            <div
              key={profile}
              className={`flex items-center justify-between p-2 rounded-md cursor-pointer ${
                currentProfile === profile ? 'bg-blue-900/50' : 'hover:bg-gray-700'
              }`}
              onClick={() => onLoad(profile)}
            >
              <span>{profile}</span>
              {currentProfile === profile && (
                <span className="text-xs bg-blue-600 px-2 py-1 rounded">Active</span>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default SaveLoadPanel;