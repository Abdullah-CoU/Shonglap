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
        {/* Sticky header row (hamburger + header) */}
        <div className="sticky top-0 z-30 flex items-center bg-white">
          <button
            onClick={() => setSidebarOpen(true)}
            className="md:hidden text-2xl px-4 py-3 text-gray-700"
            aria-label="Open menu"
          >
            ☰
          </button>
          <div className="flex-1">
            <Header />
          </div>
        </div>

        <main className="flex-1">
          {children}
        </main>
      </div>
    </div>
  );
}
