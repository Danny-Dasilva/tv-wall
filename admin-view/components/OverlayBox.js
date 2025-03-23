"use client";
import { useRef, useState, useEffect } from 'react';
import Draggable from 'react-draggable';
import { ResizableBox } from 'react-resizable';
import 'react-resizable/css/styles.css';

const OverlayBox = ({ 
  id, 
  number,
  x, 
  y, 
  width, 
  height, 
  color,
  isSelected, 
  updatePosition, 
  updateSize,
  onSelect 
}) => {
  const nodeRef = useRef(null);
  const [dimensions, setDimensions] = useState({ width, height });
  const [position, setPosition] = useState({ x, y });
  
  // Update component state when props change
  useEffect(() => {
    setDimensions({ width, height });
    setPosition({ x, y });
  }, [width, height, x, y]);
  
  // Handle drag stop event
  const handleDragStop = (e, data) => {
    const newPosition = { x: data.x, y: data.y };
    setPosition(newPosition);
    updatePosition(id, data.x, data.y);
  };

  // Handle resize stop event
  const handleResize = (e, { size }) => {
    const newDimensions = { width: size.width, height: size.height };
    setDimensions(newDimensions);
    updateSize(id, size.width, size.height);
  };

  // Map color string to Tailwind classes
  const getColorClass = () => {
    switch(color) {
      case 'red': return 'bg-red-800/60';
      case 'green': return 'bg-green-800/60';
      default: return 'bg-red-800/60';
    }
  };

  return (
    <Draggable
      nodeRef={nodeRef}
      position={position}
      onStop={handleDragStop}
      bounds="parent"
      handle=".handle"
    >
      <div ref={nodeRef} className="absolute" style={{ width: dimensions.width, height: dimensions.height }}>
        <ResizableBox
          width={dimensions.width}
          height={dimensions.height}
          onResize={handleResize}
          resizeHandles={['se']}
          handle={<div className="absolute bottom-0 right-0 w-5 h-5 cursor-se-resize">
                    <div className="absolute right-1 bottom-1 w-0 h-0 border-l-[6px] border-l-transparent border-t-[6px] border-t-transparent border-r-[6px] border-r-white"></div>
                  </div>}
        >
          <div 
            className={`w-full h-full handle cursor-move relative ${getColorClass()} ${
              isSelected ? 'ring-2 ring-white ring-opacity-100' : 'ring-1 ring-white ring-opacity-30'
            }`}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(id);
            }}
          >
            <div className="absolute top-0 left-0 bg-black/70 text-white text-xs py-1 px-2 rounded-br-md">
              Screen {number}
            </div>
          </div>
        </ResizableBox>
      </div>
    </Draggable>
  );
};

export default OverlayBox;