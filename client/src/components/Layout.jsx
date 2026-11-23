import { useState } from 'react';
import Header from './Header.jsx';
import Sidebar from './Sidebar.jsx';

/**
 * App layout: fixed sidebar + sticky header on every route.
 * Provides a mobile hamburger to open the sidebar drawer.
 */
export default function Layout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Offset main content by sidebar width on desktop */}
      <div className="md:ml-60 min-h-screen flex flex-col">
        <Header onMenuClick={() => setSidebarOpen(true)} />
        <main className="flex-1">
          {children}
        </main>
      </div>
    </div>
  );
}
