'use client';
import dynamic from 'next/dynamic';

// Only render a loading message during SSR
function LoadingFallback() {
  return <div className="min-h-screen bg-gray-900 flex items-center justify-center text-white">
    <p>Loading TV Wall Client...</p>
  </div>;
}

// Import the actual component with SSR disabled to avoid hydration errors
const ClientAppNoSSR = dynamic(() => import('./components/ClientApp'), { 
  ssr: false,
  loading: LoadingFallback
});

export default function Test() {
  return <ClientAppNoSSR />;
}