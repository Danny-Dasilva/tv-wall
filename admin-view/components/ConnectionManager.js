// components/ConnectionManager.js
import { useState } from 'react';

const ConnectionManager = ({ connections, boxes, onAssign }) => {
  const [expandedDevice, setExpandedDevice] = useState(null);
  
  const toggleDevice = (deviceId) => {
    setExpandedDevice(expandedDevice === deviceId ? null : deviceId);
  };
  
  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <h2 className="text-lg font-semibold mb-3">Connected Devices</h2>
      
      {connections.length === 0 ? (
        <p className="text-gray-400 text-sm">No devices connected</p>
      ) : (
        <div className="space-y-3 max-h-64 overflow-y-auto">
          {connections.map((device) => (
            <div key={device.id} className="border border-gray-700 rounded-md">
              <div 
                className="flex items-center justify-between p-3 cursor-pointer hover:bg-gray-700"
                onClick={() => toggleDevice(device.id)}
              >
                <div>
                  <div className="font-medium">{device.name || 'Device'}</div>
                  <div className="text-xs text-gray-400">{device.id.slice(0, 8)}</div>
                </div>
                <div className="flex items-center">
                  <div className={`w-2 h-2 rounded-full ${device.isConnected ? 'bg-green-500' : 'bg-gray-500'} mr-2`}></div>
                  <span className="text-xs bg-gray-700 px-2 py-1 rounded">
                    {device.assignedBoxId ? `Box ${boxes.find(b => b.id === device.assignedBoxId)?.number || '?'}` : 'Unassigned'}
                  </span>
                </div>
              </div>
              
              {expandedDevice === device.id && (
                <div className="p-3 border-t border-gray-700 bg-gray-700/50">
                  <h3 className="text-sm font-medium mb-2">Assign to screen:</h3>
                  <div className="grid grid-cols-2 gap-2">
                    {boxes.map((box) => (
                      <button
                        key={box.id}
                        className={`px-2 py-1 text-xs rounded-md ${
                          device.assignedBoxId === box.id
                            ? 'bg-blue-600 hover:bg-blue-700'
                            : 'bg-gray-600 hover:bg-gray-500'
                        }`}
                        onClick={() => onAssign(device.id, box.id)}
                      >
                        Screen {box.number}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ConnectionManager;
