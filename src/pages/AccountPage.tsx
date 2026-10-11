import { useState } from 'react';
import { User as UserIcon, Mail, MapPin, Sun, Moon, Save, Loader2, Calendar } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { cities } from '@/data/mockData';
import type { Page } from '@/types';

interface AccountPageProps {
  onNavigate: (page: Page) => void;
}

export function AccountPage({ onNavigate }: AccountPageProps) {
  const { user, fullName, setFullName, favoriteCity, setFavoriteCity, theme, setTheme, signOut } = useAuth();
  const [editName, setEditName] = useState(fullName);
  const [editCity, setEditCity] = useState(favoriteCity);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  if (!user) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-slate-600 dark:text-slate-400 mb-4">You need to sign in to view your account.</p>
          <button
            onClick={() => onNavigate('login')}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
          >
            Sign In
          </button>
        </div>
      </div>
    );
  }

  async function handleSave() {
    setSaving(true);
    setFullName(editName);
    setFavoriteCity(editCity);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const memberSince = user.created_at ? new Date(user.created_at).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }) : '';

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-50 dark:bg-slate-950 py-8 px-4 sm:px-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-blue-500 flex items-center justify-center shadow-lg shadow-blue-500/30">
            <UserIcon className="w-8 h-8 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              {fullName || 'Your Account'}
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">Manage your profile and preferences</p>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm p-6">
          <h2 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-white mb-4">Profile</h2>

          <div className="space-y-4">
            <div className="flex items-center gap-3 py-2">
              <Mail className="w-4 h-4 text-slate-400" />
              <span className="text-sm text-slate-500 dark:text-slate-400">Email</span>
              <span className="ml-auto text-sm font-medium text-slate-700 dark:text-slate-300">{user.email}</span>
            </div>

            <div className="flex items-center gap-3 py-2">
              <Calendar className="w-4 h-4 text-slate-400" />
              <span className="text-sm text-slate-500 dark:text-slate-400">Member since</span>
              <span className="ml-auto text-sm font-medium text-slate-700 dark:text-slate-300">{memberSince}</span>
            </div>

            <div>
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5 block">Full Name</label>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Your name"
                className="w-full px-4 py-2.5 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 dark:text-slate-200"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5 block flex items-center gap-1.5">
                <MapPin className="w-4 h-4" /> Favorite City
              </label>
              <select
                value={editCity}
                onChange={(e) => setEditCity(e.target.value)}
                className="w-full px-4 py-2.5 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 dark:text-slate-200"
              >
                <option value="">None selected</option>
                {cities.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saved ? 'Saved!' : 'Save Changes'}
            </button>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm p-6">
          <h2 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-white mb-4">Appearance</h2>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setTheme('light')}
              className={`flex items-center gap-2 px-4 py-3 rounded-xl border transition-all ${
                theme === 'light'
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400'
                  : 'border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400'
              }`}
            >
              <Sun className="w-5 h-5" />
              <span className="text-sm font-medium">Light Mode</span>
            </button>
            <button
              onClick={() => setTheme('dark')}
              className={`flex items-center gap-2 px-4 py-3 rounded-xl border transition-all ${
                theme === 'dark'
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400'
                  : 'border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400'
              }`}
            >
              <Moon className="w-5 h-5" />
              <span className="text-sm font-medium">Dark Mode</span>
            </button>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm p-6">
          <h2 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-white mb-2">Session</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
            Sign out of your account. You can sign back in at any time.
          </p>
          <button
            onClick={signOut}
            className="px-4 py-2 bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 text-sm font-medium rounded-lg hover:bg-red-100 dark:hover:bg-red-950/50 transition-colors"
          >
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}
