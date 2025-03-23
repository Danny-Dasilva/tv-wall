import React, { useState, useEffect, useRef } from 'react';
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
  onBoxSelect?: (boxId: string | null, box: Box | null) => void;
}

// Generate a random pastel color with opacity
const getRandomColor = () => {
  // Generate pastel colors for better visibility
  const hue = Math.floor(Math.random() * 360);
  return `hsla(${hue}, 70%, 80%, 0.4)`;
};

const BoxGrid: React.FC<BoxGridProps> = ({
  clients,
  updateClientConfig,
  containerWidth,
  containerHeight,
  onBoxSelect
}) => {
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [selectedBoxId, setSelectedBoxId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [showClientPanel, setShowClientPanel] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);
  const [gridDimensions, setGridDimensions] = useState({ width: 0, height: 0 });
  
  // Calculate scale factors between video dimensions and display dimensions
  const scaleX = containerWidth > 0 ? gridDimensions.width / containerWidth : 1;
  const scaleY = containerHeight > 0 ? gridDimensions.height / containerHeight : 1;
  
  // Update grid dimensions when container changes
  useEffect(() => {
    const updateGridDimensions = () => {
      if (gridRef.current) {
        const rect = gridRef.current.getBoundingClientRect();
        setGridDimensions({
          width: rect.width,
          height: rect.height
        });
      }
    };
    
    updateGridDimensions();
    
    // Update on resize
    window.addEventListener('resize', updateGridDimensions);
    return () => window.removeEventListener('resize', updateGridDimensions);
  }, [containerWidth, containerHeight]);
  
  // Convert video coordinates to grid coordinates
  const toGridX = (x: number) => Math.round(x * scaleX);
  const toGridY = (y: number) => Math.round(y * scaleY);
  const toGridWidth = (width: number) => Math.round(width * scaleX);
  const toGridHeight = (height: number) => Math.round(height * scaleY);
  
  // Convert grid coordinates to video coordinates
  const toVideoX = (x: number) => Math.round(x / scaleX);
  const toVideoY = (y: number) => Math.round(y / scaleY);
  const toVideoWidth = (width: number) => Math.round(width / scaleX);
  const toVideoHeight = (height: number) => Math.round(height / scaleY);
  
  // Initialize or update boxes from client configurations
  useEffect(() => {
    console.log('Processing clients update, clients count:', clients.length);
    
    // Keep track of which boxes we're updating to avoid recreating deleted boxes
    setBoxes(prevBoxes => {
      // Get manually created boxes (those without clientId)
      const manualBoxes = prevBoxes.filter(box => !box.clientId);
      
      // Convert clients with regions to boxes
      const clientBoxes = clients
        .filter(client => client.region) // Only process clients with regions
        .map(client => {
          // Find existing box for this client
          const existingBox = prevBoxes.find(box => box.clientId === client.clientId);
          
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
      
      console.log('Updated boxes - Manual:', manualBoxes.length, 'Client:', clientBoxes.length);
      
      // Combine both types of boxes
      return [...manualBoxes, ...clientBoxes];
    });
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
    setShowClientPanel(true);
  };
  
  // Delete a box
  const deleteBox = (id: string) => {
    console.log('Deleting box with id:', id);
    
    // Find the box to be deleted
    const box = boxes.find(box => box.id === id);
    if (!box) {
      console.error('Box not found:', id);
      return;
    }
    
    // First update boxes state by filtering out the deleted box
    setBoxes(prevBoxes => {
      console.log('Previous boxes:', prevBoxes.length, 'Removing box:', id);
      return prevBoxes.filter(b => b.id !== id);
    });
    
    // If box is assigned to a client, clear its region
    // Do this after removing the box to prevent the useEffect from recreating it
    if (box.clientId) {
      console.log('Clearing region for client:', box.clientId);
      // Small timeout to ensure the box is removed first
      setTimeout(() => {
        updateClientConfig(box.clientId!, { region: undefined });
      }, 50);
    }
    
    // Clear selection if the deleted box was selected
    if (selectedBoxId === id) {
      console.log('Clearing selection');
      setSelectedBoxId(null);
      setShowClientPanel(false);
    }
  };
  
  // Notify parent component when a box is selected
  useEffect(() => {
    if (onBoxSelect) {
      const selectedBox = selectedBoxId ? boxes.find(box => box.id === selectedBoxId) || null : null;
      onBoxSelect(selectedBoxId, selectedBox);
    }
  }, [selectedBoxId, boxes, onBoxSelect]);
  
  // Assign a client to a box - exposed for parent component to use
  const assignClientToBox = (boxId: string, clientId: string) => {
    const box = boxes.find(box => box.id === boxId);
    if (!box) return;
    
    // Use functional update to ensure we're working with the latest state
    setBoxes(prevBoxes => {
      // First, remove the client from any other box
      return prevBoxes.map(b => {
        if (b.clientId === clientId) {
          return { ...b, clientId: undefined };
        }
        if (b.id === boxId) {
          return { ...b, clientId };
        }
        return b;
      });
    });
    
    // Update client configuration with this box's dimensions
    // Important: Send the actual video coordinates, not grid coordinates
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
    gridX: number,
    gridY: number,
    gridWidth: number,
    gridHeight: number
  ) => {
    // Convert grid coordinates to video coordinates
    const x = toVideoX(gridX);
    const y = toVideoY(gridY);
    const width = toVideoWidth(gridWidth);
    const height = toVideoHeight(gridHeight);
    
    // Update local state with video coordinates
    const updatedBoxes = boxes.map(box => {
      if (box.id === id) {
        return {
          ...box,
          x,
          y,
          width,
          height
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
          x,
          y,
          width,
          height
        }
      });
    }
  };

  return (
    <div 
      ref={gridRef} 
      className="h-full w-full relative"
      style={{ aspectRatio: containerWidth && containerHeight ? `${containerWidth}/${containerHeight}` : undefined }}
    >
      {/* Toolbar - floating at top */}
      <div className="absolute top-0 left-0 right-0 p-2 z-[500]">
        <div className="flex gap-2">
          <button
            onClick={addBox}
            className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors text-sm shadow-md"
          >
            Add Region
          </button>
          
          {selectedBoxId && (
            <button
              onClick={() => {
                setSelectedBoxId(null);
                setShowClientPanel(false);
              }}
              className="px-3 py-1 bg-gray-200 text-gray-800 rounded hover:bg-gray-300 text-sm shadow-md"
            >
              Cancel Selection
            </button>
          )}
        </div>
      </div>
      
      {/* Box container - this needs to cover the entire area */}
      <div className="absolute inset-0 w-full h-full">
        {/* Render each box */}
        {boxes.map(box => {
          const isSelected = selectedBoxId === box.id;
          const client = clients.find(c => c.clientId === box.clientId);
          
          // Convert from video coordinates to grid coordinates for display
          const gridX = toGridX(box.x);
          const gridY = toGridY(box.y);
          const gridWidth = toGridWidth(box.width);
          const gridHeight = toGridHeight(box.height);
          
          return (
            <Rnd
              key={box.id}
              size={{ width: gridWidth, height: gridHeight }}
              position={{ x: gridX, y: gridY }}
              onDragStart={() => {
                setIsDragging(true);
                setSelectedBoxId(box.id);
                setShowClientPanel(true);
              }}
              onDragStop={(e, d) => {
                setIsDragging(false);
                updateBoxPosition(box.id, d.x, d.y, gridWidth, gridHeight);
              }}
              onResizeStart={() => {
                setSelectedBoxId(box.id);
                setShowClientPanel(true);
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
              onClick={() => {
                setSelectedBoxId(box.id);
                setShowClientPanel(true);
              }}
              bounds="parent"
              dragGrid={[10, 10]}
              resizeGrid={[10, 10]}
              style={{
                border: isSelected ? '3px solid rgba(255,0,0,0.8)' : '3px solid rgba(0,0,255,0.7)',
                backgroundColor: box.color || 'rgba(59, 130, 246, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backdropFilter: 'brightness(1.1)',
                zIndex: 100 // Ensure it's above the video
              }}
            >
              <div className="flex flex-col items-center justify-center w-full h-full p-2">
                {/* Box label */}
                <div className="font-semibold text-center text-sm bg-white p-0.5 rounded shadow-md">
                  {client?.name || box.clientId || 'Unassigned'}
                </div>
                
                {/* Box dimensions (show actual video dimensions) */}
                <div className="text-xs mt-0.5 bg-black text-white p-0.25 rounded shadow-md">
                  {box.width} × {box.height}
                </div>
                
                {/* Controls for selected box */}
                {isSelected && (
                  <div className="absolute top-0 right-0 p-1">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        // Call deleteBox directly with the current box id
                        console.log('Delete button clicked for box:', box.id);
                        deleteBox(box.id);
                      }}
                      className="w-6 h-6 flex items-center justify-center bg-red-500 text-white rounded-full shadow-md z-50"
                      aria-label="Delete region"
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
      
      {/* Client assignment panel has been moved to the parent component */}
    </div>
  );
};

export default BoxGrid;