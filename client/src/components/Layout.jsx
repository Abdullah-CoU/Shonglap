import { useState } from 'react';
import Header from './Header.jsx';
import Sidebar from './Sidebar.jsx';

/**
 * App layout: header + sidebar on every route.
 * Provides a mobile hamburger to open the sidebar drawer.
 */
export default function Layout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="flex">
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

        <div className="flex-1 min-w-0 flex flex-col">
          <div className="flex items-center">
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
    </div>
  );
}
