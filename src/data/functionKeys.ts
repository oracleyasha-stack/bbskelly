import type { AssetClass } from '../types/terminal';

export interface FKey {
  key: string;
  label: string;
  assetClass?: AssetClass;
  command?: string;
  colorClass: string;
}

/**
 * F1-F12 key map. Lives outside the component so `FunctionKeysBar.tsx` only
 * exports a component, which keeps React Fast Refresh working.
 */
export const FUNCTION_KEYS: FKey[] = [
  { key: 'F1', label: 'HELP', command: 'HELP', colorClass: 'text-amber-400 border-amber-500/40 hover:bg-amber-500/10' },
  { key: 'F2', label: 'GOVT', assetClass: 'GOVT', command: 'YCRV', colorClass: 'text-cyan-400 border-cyan-500/40 hover:bg-cyan-500/10' },
  { key: 'F3', label: 'CORP', assetClass: 'EQUITY', command: 'DES', colorClass: 'text-blue-400 border-blue-500/40 hover:bg-blue-500/10' },
  { key: 'F4', label: 'TOP', command: 'TOP', colorClass: 'text-yellow-400 border-yellow-500/40 hover:bg-yellow-500/10' },
  { key: 'F5', label: 'WEI', command: 'WEI', colorClass: 'text-emerald-400 border-emerald-500/40 hover:bg-emerald-500/10' },
  { key: 'F6', label: 'FA', command: 'FA', colorClass: 'text-purple-400 border-purple-500/40 hover:bg-purple-500/10' },
  { key: 'F7', label: 'ANR', command: 'ANR', colorClass: 'text-indigo-400 border-indigo-500/40 hover:bg-indigo-500/10' },
  { key: 'F8', label: 'EQUITY', assetClass: 'EQUITY', command: 'AAPL GP', colorClass: 'text-emerald-400 border-emerald-500/40 hover:bg-emerald-500/10' },
  { key: 'F9', label: 'CMDTY', assetClass: 'CMDTY', command: 'GOLD GP', colorClass: 'text-amber-500 border-amber-500/40 hover:bg-amber-500/10' },
  { key: 'F10', label: 'INDEX', assetClass: 'INDEX', command: 'SPX WEI', colorClass: 'text-teal-400 border-teal-500/40 hover:bg-teal-500/10' },
  { key: 'F11', label: 'CURR', assetClass: 'CURR', command: 'FX', colorClass: 'text-cyan-400 border-cyan-500/40 hover:bg-cyan-500/10' },
  { key: 'F12', label: 'PORT', command: 'PORT', colorClass: 'text-pink-400 border-pink-500/40 hover:bg-pink-500/10' },
];