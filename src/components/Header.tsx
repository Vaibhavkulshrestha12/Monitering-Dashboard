import { List } from 'lucide-react';
import { ComponentWithDarkMode } from '../types';

export function Header({ darkMode }: ComponentWithDarkMode) {
  return (
    <header className="mb-8">
      <h1 className={`text-3xl font-bold flex items-center gap-2 ${
        darkMode ? 'text-white' : 'text-gray-900'
      }`}>
        <img 
          src="../images/logo.png" 
          alt="System Performance" 
          className="w-8 h-8"
        />
        <List className="w-8 h-8 text-emerald-600" />
        System Performance Dashboard
      </h1>
    </header>
  );
}