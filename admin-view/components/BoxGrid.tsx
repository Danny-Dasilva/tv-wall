import React, { useState, useEffect, useCallback } from 'react';
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
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [isResizing, setIsResizing] = useState<boolean>(false);
  const [updateTimers, setUpdateTimers] = useState<{[key: string]: NodeJS.Timeout}>({});
  
  // Update when container dimensions change
  useEffect(() => {
    setCanvasSize({ width: containerWidth, height: containerHeight });
  }, [containerWidth, containerHeight]);
  
  // Initialize boxes from client configurations
  useEffect(() => {
    // Check if we need to initialize or update boxes
    const shouldUpdate = clients.some(client => {
      if (!client.region) return false;

      // Check if this client already has a box
      const existingBox = boxes.find(box => box.clientId === client.clientId);
      if (!existingBox) return true;

      // Check if region has changed
      const region = client.region;
      return (
        existingBox.x !== region.x ||
        existingBox.y !== region.y ||
        existingBox.width !== region.width ||
        existingBox.height !== region.height
      );
    });

    if (shouldUpdate || boxes.length === 0) {
      const updatedBoxes = clients
        .filter(client => client.region)
        .map(client => {
          // Check if this client already has a box
          const existingBox = boxes.find(box => box.clientId === client.clientId);
          
          return {
            id: existingBox?.id || `box-${client.clientId}-${Date.now()}`,
            x: client.region?.x || 0,
            y: client.region?.y || 0,
            width: client.region?.width || 100,
            height: client.region?.height || 100,
            clientId: client.clientId
          };
        });
      
      if (updatedBoxes.length > 0) {
        setBoxes(prevBoxes => {
          // Keep boxes that don't have client IDs (manually added boxes)
          const manualBoxes = prevBoxes.filter(box => !box.clientId);
          return [...manualBoxes, ...updatedBoxes];
        });
      }
    }
  }, [clients, boxes]);

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
  const assignClientToBox = useCallback((boxId: string, clientId: string) => {
    // First, find the box that will be assigned to this client
    const targetBox = boxes.find(box => box.id === boxId);
    if (!targetBox) return;
    
    // Update boxes state locally first
    setBoxes(prevBoxes => prevBoxes.map(box => {
      if (box.clientId === clientId) {
        return { ...box, clientId: undefined };
      }
      if (box.id === boxId) {
        return { ...box, clientId };
      }
      return box;
    }));
    
    // Then update server config
    updateClientConfig(clientId, {
      region: {
        x: targetBox.x,
        y: targetBox.y,
        width: targetBox.width,
        height: targetBox.height,
        totalWidth: canvasSize.width,
        totalHeight: canvasSize.height
      }
    });
  }, [boxes, canvasSize, updateClientConfig]);

  // Handle drag start
  const handleDragStart = () => {
    setIsDragging(true);
  };
  
  // Handle resize start
  const handleResizeStart = () => {
    setIsResizing(true);
  };

  // Debounced update function to prevent too many rapid updates
  const debouncedUpdate = useCallback((
    clientId: string,
    region: {
      x: number,
      y: number,
      width: number,
      height: number,
      totalWidth: number,
      totalHeight: number
    }
  ) => {
    // Clear existing timer for this client
    if (updateTimers[clientId]) {
      clearTimeout(updateTimers[clientId]);
    }
    
    // Set a new timer
    const timerId = setTimeout(() => {
      updateClientConfig(clientId, { region });
      
      // Remove this timer from the state
      setUpdateTimers(prev => {
        const newTimers = { ...prev };
        delete newTimers[clientId];
        return newTimers;
      });
    }, 100); // 100ms debounce
    
    // Store the timer ID
    setUpdateTimers(prev => ({ ...prev, [clientId]: timerId }));
  }, [updateTimers, updateClientConfig]);

  // Finalize position changes after drag/resize ends
  const updateBoxPosition = useCallback((
    boxId: string, 
    position: { x: number, y: number, width?: number, height?: number }
  ) => {
    setIsDragging(false);
    setIsResizing(false);
    
    const updatedBoxes = boxes.map(box => {
      if (box.id === boxId) {
        const updatedBox = { 
          ...box, 
          x: position.x, 
          y: position.y 
        };
        
        if (position.width !== undefined) {
          updatedBox.width = position.width;
        }
        
        if (position.height !== undefined) {
          updatedBox.height = position.height;
        }
        
        return updatedBox;
      }
      return box;
    });
    
    setBoxes(updatedBoxes);
    
    // If a client is assigned to this box, update its region
    const updatedBox = updatedBoxes.find(box => box.id === boxId);
    if (updatedBox?.clientId) {
      debouncedUpdate(updatedBox.clientId, {
        x: updatedBox.x,
        y: updatedBox.y,
        width: updatedBox.width,
        height: updatedBox.height,
        totalWidth: canvasSize.width,
        totalHeight: canvasSize.height
      });
    }
  }, [boxes, canvasSize, debouncedUpdate]);

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      Object.values(updateTimers).forEach(timer => clearTimeout(timer));
    };
  }, [updateTimers]);

  return (
    <>
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-lg font-semibold">Visual Client Configuration</h3>
        <button 
          onClick={addBox}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
        >
          Add Box
        </button>
      </div>
      
      {/* Boxes are rendered inside the parent container */}
      {boxes.map((box) => {
        const isSelected = selectedBox === box.id;
        const client = clients.find(c => c.clientId === box.clientId);
        
        return (
          <Rnd
            key={box.id}
            size={{ width: box.width, height: box.height }}
            position={{ x: box.x, y: box.y }}
            onDragStart={handleDragStart}
            onResizeStart={handleResizeStart}
            onDragStop={(e, d) => {
              updateBoxPosition(box.id, { 
                x: d.x, 
                y: d.y 
              });
            }}
            onResizeStop={(e, direction, ref, delta, position) => {
              updateBoxPosition(box.id, {
                x: position.x,
                y: position.y,
                width: parseInt(ref.style.width),
                height: parseInt(ref.style.height)
              });
            }}
            onClick={() => setSelectedBox(box.id)}
            className={`z-${isSelected ? 50 : 40}`}
            style={{
              border: `2px solid ${isSelected ? 'red' : (box.clientId ? 'blue' : 'gray')}`,
              backgroundColor: box.clientId 
                ? 'rgba(59, 130, 246, 0.3)' 
                : 'rgba(255, 255, 255, 0.5)',
              backdropFilter: 'blur(2px)',
              pointerEvents: 'auto'
            }}
            resizeGrid={[10, 10]}
            dragGrid={[10, 10]}
            bounds="parent"
          >
            <div className="absolute inset-0 flex flex-col items-center justify-center p-2">
              <div className="text-sm font-semibold truncate w-full text-center">
                {client?.name || box.clientId || 'Unassigned'}
              </div>
              
              <div className="text-xs text-center opacity-75 mt-1">
                {Math.round(box.width)} × {Math.round(box.height)}
              </div>
              
              {isSelected && (
                <div className="absolute top-1 right-1 flex gap-1">
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteBox(box.id);
                    }}
                    className="w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600"
                  >
                    ×
                  </button>
                </div>
              )}
            </div>
          </Rnd>
        );
      })}
      
      {selectedBox && (
        <div 
          className="mt-4 p-4 border border-gray-200 rounded bg-gray-50"
          style={{ marginTop: `${canvasSize.height + 20}px` }}
        >
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
    </>
  );
};

export default BoxGrid;