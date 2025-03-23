import React, { useState, useEffect } from 'react';
import { Rnd } from 'react-rnd';

interface Box {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  clientId?: string;
}

interface ClientType {
  clientId: string;
  name?: string;
  connected: boolean;
  region?: {
    x: number;
    y: number;
    width: number;
    height: number;
    totalWidth: number;
    totalHeight: number;
  };
  socketId: string;
}

interface BoxGridProps {
  clients: ClientType[];
  updateClientConfig: (clientId: string, config: Partial<ClientType>) => void;
  containerWidth: number;
  containerHeight: number;
}

const BoxGrid: React.FC<BoxGridProps> = ({ 
  clients, 
  updateClientConfig,
  containerWidth,
  containerHeight
}) => {
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [selectedBox, setSelectedBox] = useState<string | null>(null);
  const [canvasSize, setCanvasSize] = useState({ width: containerWidth, height: containerHeight });
  
  // Initialize boxes from existing client configurations
  useEffect(() => {
    const initialBoxes = clients
      .filter(client => client.region)
      .map(client => ({
        id: client.clientId,
        x: client.region?.x || 0,
        y: client.region?.y || 0,
        width: client.region?.width || 100,
        height: client.region?.height || 100,
        clientId: client.clientId
      }));
    
    if (initialBoxes.length > 0) {
      setBoxes(initialBoxes);
    }
  }, []);

  // Create a new box
  const addBox = () => {
    const newBox: Box = {
      id: `box-${Date.now()}`,
      x: 10,
      y: 10,
      width: 200,
      height: 150
    };
    setBoxes([...boxes, newBox]);
    setSelectedBox(newBox.id);
  };

  // Delete a box
  const deleteBox = (id: string) => {
    // Find if there's a client assigned to this box
    const box = boxes.find(b => b.id === id);
    if (box?.clientId) {
      // Clear the client's region
      updateClientConfig(box.clientId, {
        region: undefined
      });
    }
    
    setBoxes(boxes.filter(box => box.id !== id));
    if (selectedBox === id) {
      setSelectedBox(null);
    }
  };

  // Assign a client to a box
  const assignClientToBox = (boxId: string, clientId: string) => {
    // Remove client from any existing box
    const updatedBoxes = boxes.map(box => {
      if (box.clientId === clientId) {
        return { ...box, clientId: undefined };
      }
      if (box.id === boxId) {
        return { ...box, clientId };
      }
      return box;
    });
    
    setBoxes(updatedBoxes);
    
    // Find the selected box
    const selectedBox = updatedBoxes.find(box => box.id === boxId);
    if (selectedBox) {
      // Update client configuration with box dimensions
      updateClientConfig(clientId, {
        region: {
          x: selectedBox.x,
          y: selectedBox.y,
          width: selectedBox.width,
          height: selectedBox.height,
          totalWidth: canvasSize.width,
          totalHeight: canvasSize.height
        }
      });
    }
  };

  // Update client config when box is resized or moved
  const updateBoxPosition = (boxId: string, position: { x: number, y: number, width: number, height: number }) => {
    const updatedBoxes = boxes.map(box => {
      if (box.id === boxId) {
        return { ...box, ...position };
      }
      return box;
    });
    
    setBoxes(updatedBoxes);
    
    // Find the box that was updated
    const updatedBox = updatedBoxes.find(box => box.id === boxId);
    
    // If a client is assigned to this box, update its region
    if (updatedBox?.clientId) {
      updateClientConfig(updatedBox.clientId, {
        region: {
          x: updatedBox.x,
          y: updatedBox.y,
          width: updatedBox.width,
          height: updatedBox.height,
          totalWidth: canvasSize.width,
          totalHeight: canvasSize.height
        }
      });
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-lg font-semibold">Visual Client Configuration</h3>
        <button 
          onClick={addBox}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
        >
          Add Box
        </button>
      </div>
      
      <div 
        className="relative bg-gray-100 border border-gray-300 rounded"
        style={{ width: canvasSize.width, height: canvasSize.height }}
      >
        {boxes.map((box) => {
          const isSelected = selectedBox === box.id;
          const client = clients.find(c => c.clientId === box.clientId);
          
          return (
            <Rnd
              key={box.id}
              size={{ width: box.width, height: box.height }}
              position={{ x: box.x, y: box.y }}
              onDragStop={(e, d) => {
                updateBoxPosition(box.id, { 
                  ...box,
                  x: d.x, 
                  y: d.y 
                });
              }}
              onResizeStop={(e, direction, ref, delta, position) => {
                updateBoxPosition(box.id, {
                  ...box,
                  width: parseInt(ref.style.width),
                  height: parseInt(ref.style.height),
                  x: position.x,
                  y: position.y
                });
              }}
              onClick={() => setSelectedBox(box.id)}
              className={`
                flex items-center justify-center
                ${isSelected ? 'z-10' : 'z-0'}
                ${box.clientId ? 'bg-blue-50' : 'bg-white'}
              `}
              style={{
                border: `2px solid ${isSelected ? 'red' : (box.clientId ? 'blue' : 'gray')}`,
              }}
            >
              <div className="absolute inset-0 flex flex-col items-center justify-center p-2">
                <div className="text-sm font-semibold truncate w-full text-center">
                  {client?.name || box.clientId || 'Unassigned'}
                </div>
                
                {isSelected && (
                  <div className="absolute top-1 right-1 flex gap-1">
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteBox(box.id);
                      }}
                      className="w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center"
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
      
      {selectedBox && (
        <div className="mt-4 p-4 border border-gray-200 rounded bg-gray-50">
          <h4 className="font-medium mb-2">Assign client to selected box</h4>
          <div className="grid grid-cols-2 gap-2">
            {clients.map(client => (
              <button
                key={client.clientId}
                onClick={() => assignClientToBox(selectedBox, client.clientId)}
                className={`
                  p-2 text-sm rounded
                  ${boxes.find(b => b.id === selectedBox)?.clientId === client.clientId
                    ? 'bg-green-500 text-white'
                    : 'bg-gray-200 hover:bg-gray-300'
                  }
                `}
              >
                {client.name || client.clientId}
                {!client.connected && ' (Disconnected)'}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default BoxGrid;
