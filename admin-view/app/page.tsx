// pages/index.js
import Head from 'next/head';
import TvWallMapper from '../components/TvWallMapper';

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <Head>
        <title>TV Wall Mapper</title>
        <meta name="description" content="Map content to TV screens" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-center mb-8">TV Wall Mapper</h1>
        <TvWallMapper />
      </main>
    </div>
  );
}