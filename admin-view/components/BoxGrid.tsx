import React, { useState, useEffect } from 'react';
import { Rnd } from 'react-rnd';

// Simple box interface
interface Box {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  clientId?: string;
  color?: string;
}

// Client interface
interface Client {
  clientId: string;
  name?: string;
  connected: boolean;
  region?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  socketId: string;
}

interface BoxGridProps {
  clients: Client[];
  updateClientConfig: (clientId: string, config: Partial<Client>) => void;
  containerWidth: number;
  containerHeight: number;
}

// Generate a random pastel color
const getRandomColor = () => {
  // Generate pastel colors for better visibility
  const hue = Math.floor(Math.random() * 360);
  return `hsla(${hue}, 70%, 80%, 0.5)`;
};

const BoxGrid: React.FC<BoxGridProps> = ({
  clients,
  updateClientConfig,
  containerWidth,
  containerHeight
}) => {
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [selectedBoxId, setSelectedBoxId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  
  // Initialize or update boxes from client configurations
  useEffect(() => {
    // Convert clients to boxes (if they have regions)
    const clientBoxes = clients
      .filter(client => client.region)
      .map(client => {
        // Find existing box for this client
        const existingBox = boxes.find(box => box.clientId === client.clientId);
        
        // Use existing box color if available
        const color = existingBox?.color || getRandomColor();
        
        return {
          id: existingBox?.id || `box-${client.clientId}`,
          x: client.region!.x,
          y: client.region!.y,
          width: client.region!.width,
          height: client.region!.height,
          clientId: client.clientId,
          color
        };
      });
    
    // Find boxes without client IDs (manually created boxes)
    const manualBoxes = boxes.filter(box => !box.clientId);
    
    // Combine both types of boxes
    setBoxes([...manualBoxes, ...clientBoxes]);
  }, [clients]);
  
  // Create a new box
  const addBox = () => {
    // Default box size (quarter of container)
    const newBox: Box = {
      id: `box-${Date.now()}`,
      x: Math.round(containerWidth * 0.25),
      y: Math.round(containerHeight * 0.25),
      width: Math.round(containerWidth * 0.5),
      height: Math.round(containerHeight * 0.5),
      color: getRandomColor()
    };
    
    setBoxes([...boxes, newBox]);
    setSelectedBoxId(newBox.id);
  };
  
  // Delete a box
  const deleteBox = (id: string) => {
    const box = boxes.find(box => box.id === id);
    
    // If box is assigned to a client, clear its region
    if (box?.clientId) {
      updateClientConfig(box.clientId, { region: undefined });
    }
    
    setBoxes(boxes.filter(box => box.id !== id));
    if (selectedBoxId === id) {
      setSelectedBoxId(null);
    }
  };
  
  // Assign a client to a box
  const assignClientToBox = (boxId: string, clientId: string) => {
    const box = boxes.find(box => box.id === boxId);
    if (!box) return;
    
    // First, remove the client from any other box
    const updatedBoxes = boxes.map(b => {
      if (b.clientId === clientId) {
        return { ...b, clientId: undefined };
      }
      if (b.id === boxId) {
        return { ...b, clientId };
      }
      return b;
    });
    
    setBoxes(updatedBoxes);
    
    // Update client configuration with this box's dimensions
    updateClientConfig(clientId, {
      region: {
        x: Math.round(box.x),
        y: Math.round(box.y),
        width: Math.round(box.width),
        height: Math.round(box.height)
      }
    });
  };
  
  // Update box position after drag or resize
  const updateBoxPosition = (
    id: string,
    x: number,
    y: number,
    width: number,
    height: number
  ) => {
    // Ensure values are integers
    const roundedX = Math.round(x);
    const roundedY = Math.round(y);
    const roundedWidth = Math.round(width);
    const roundedHeight = Math.round(height);
    
    // Update local state
    const updatedBoxes = boxes.map(box => {
      if (box.id === id) {
        return {
          ...box,
          x: roundedX,
          y: roundedY,
          width: roundedWidth,
          height: roundedHeight
        };
      }
      return box;
    });
    
    setBoxes(updatedBoxes);
    
    // If this box is assigned to a client, update the client
    const box = updatedBoxes.find(box => box.id === id);
    if (box?.clientId) {
      updateClientConfig(box.clientId, {
        region: {
          x: roundedX,
          y: roundedY,
          width: roundedWidth,
          height: roundedHeight
        }
      });
    }
  };

  return (
    <div className="box-grid">
      {/* Toolbar */}
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold">Visual Layout Editor</h3>
        <button
          onClick={addBox}
          className="px-3 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
        >
          Add New Box
        </button>
      </div>
      
      {/* Box container - the visual editor */}
      <div
        className="relative border border-gray-300 bg-gray-100"
        style={{
          width: '100%',
          height: containerWidth > 800 ? `${containerHeight}px` : 'auto',
          aspectRatio: `${containerWidth}/${containerHeight}`
        }}
      >
        {/* Render each box */}
        {boxes.map(box => {
          const isSelected = selectedBoxId === box.id;
          const client = clients.find(c => c.clientId === box.clientId);
          
          return (
            <Rnd
              key={box.id}
              size={{ width: box.width, height: box.height }}
              position={{ x: box.x, y: box.y }}
              onDragStart={() => {
                setIsDragging(true);
                setSelectedBoxId(box.id);
              }}
              onDragStop={(e, d) => {
                setIsDragging(false);
                updateBoxPosition(box.id, d.x, d.y, box.width, box.height);
              }}
              onResizeStart={() => {
                setSelectedBoxId(box.id);
              }}
              onResizeStop={(e, direction, ref, delta, position) => {
                updateBoxPosition(
                  box.id, 
                  position.x, 
                  position.y, 
                  parseInt(ref.style.width), 
                  parseInt(ref.style.height)
                );
              }}
              onClick={() => setSelectedBoxId(box.id)}
              bounds="parent"
              dragGrid={[10, 10]}
              resizeGrid={[10, 10]}
              className="flex items-center justify-center"
              style={{
                border: isSelected ? '2px solid red' : '2px solid blue',
                backgroundColor: box.color || 'rgba(59, 130, 246, 0.3)',
                zIndex: isSelected ? 100 : 10
              }}
            >
              <div className="flex flex-col items-center justify-center w-full h-full p-2">
                {/* Box label */}
                <div className="font-semibold text-center text-sm bg-white bg-opacity-80 px-2 py-1 rounded">
                  {client?.name || box.clientId || 'Unassigned'}
                </div>
                
                {/* Box dimensions */}
                <div className="text-xs mt-1 bg-black bg-opacity-50 text-white px-2 py-0.5 rounded">
                  {Math.round(box.width)} × {Math.round(box.height)}
                </div>
                
                {/* Controls for selected box */}
                {isSelected && (
                  <div className="absolute top-0 right-0 p-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteBox(box.id);
                      }}
                      className="w-6 h-6 flex items-center justify-center bg-red-500 text-white rounded-full"
                    >
                      ×
                    </button>
                  </div>
                )}
              </div>
            </Rnd>
          );
        })}
      </div>
      
      {/* Client assignment panel (only shown when a box is selected) */}
      {selectedBoxId && (
        <div className="mt-4 p-4 border rounded bg-gray-50">
          <h4 className="font-medium mb-2">Assign Client to Selected Box</h4>
          
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {clients.map(client => {
              const isAssigned = boxes.find(b => b.id === selectedBoxId)?.clientId === client.clientId;
              const isAssignedToOther = boxes.some(b => b.id !== selectedBoxId && b.clientId === client.clientId);
              
              return (
                <button
                  key={client.clientId}
                  onClick={() => assignClientToBox(selectedBoxId, client.clientId)}
                  className={`
                    p-2 text-sm rounded flex items-center justify-between
                    ${isAssigned ? 'bg-green-500 text-white' : isAssignedToOther ? 'bg-yellow-200' : 'bg-gray-200 hover:bg-gray-300'}
                  `}
                  title={isAssignedToOther ? 'Currently assigned to another box' : ''}
                >
                  <span className="truncate">
                    {client.name || client.clientId}
                  </span>
                  <span className={`ml-1 w-2 h-2 rounded-full ${client.connected ? 'bg-green-500' : 'bg-red-500'}`}></span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default BoxGrid;