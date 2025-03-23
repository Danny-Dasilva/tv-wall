import Head from 'next/head';
import ClientView from '../components/ClientView';
import React from 'react';

const ClientPage: React.FC = () => {
  return (
    <>
      <Head>
        <title>TV Wall Client</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
      </Head>
      <style jsx global>{`
        body {
          margin: 0;
          padding: 0;
          overflow: hidden;
          background-color: #000;
          color: #fff;
        }
        .loading, .connecting {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100vh;
          font-size: 24px;
          text-align: center;
        }
        .status-overlay {
          position: absolute;
          bottom: 10px;
          right: 10px;
          padding: 5px 10px;
          background-color: rgba(0, 0, 0, 0.5);
          border-radius: 4px;
          font-size: 14px;
          opacity: 0.7;
        }
      `}</style>
      <ClientView />
    </>
  );
};

export default ClientPage;
