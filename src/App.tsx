/**
 * App.tsx
 * Root application component.
 * Direct access to the Physiosis Dashboard.
 */

import React from 'react';
import { AuthProvider } from './context/AuthContext';
import { Dashboard } from './components/dashboard/Dashboard';

const App: React.FC = () => {
  return (
    <AuthProvider>
      <Dashboard />
    </AuthProvider>
  );
};

export default App;
