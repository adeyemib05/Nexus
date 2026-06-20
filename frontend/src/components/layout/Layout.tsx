import type { ReactNode } from 'react';
import Sidebar from './Sidebar';
import Header from './Header';

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  return (
    <div className="flex h-screen overflow-hidden bg-nexus-void">
      <Sidebar />
      <div className="flex flex-col flex-1 overflow-hidden">
        <Header />
        {/* pb-20 on mobile so content clears the fixed bottom nav */}
        <main className="flex-1 overflow-y-auto p-6 lg:p-8 pb-20 lg:pb-8">{children}</main>
      </div>
    </div>
  );
}
