import React from 'react';
import type { AssetClass } from '../../types/terminal';
import { audioService } from '../../services/audioService';
import { FUNCTION_KEYS, type FKey } from '../../data/functionKeys';

interface FunctionKeysBarProps {
  activeAssetClass: AssetClass;
  onSelectAssetClass: (assetClass: AssetClass) => void;
  onSelectFunction: (code: string) => void;
}

export const FunctionKeysBar: React.FC<FunctionKeysBarProps> = React.memo(({
  activeAssetClass,
  onSelectAssetClass,
  onSelectFunction,
}) => {
  const handleClick = (fKey: FKey) => {
    audioService.playKeyClick();
    if (fKey.assetClass) {
      onSelectAssetClass(fKey.assetClass);
    }
    if (fKey.command) {
      onSelectFunction(fKey.command);
    }
  };

  return (
    <div role="toolbar" aria-label="Asset class and function shortcuts" className="hidden md:flex items-center space-x-1 px-2 py-1 bg-[#090d14] border-b border-[#2b3a58] overflow-x-auto text-[10px] font-mono">
      <span className="text-[9px] text-zinc-500 font-bold tracking-wider mr-1 shrink-0">AN:</span>
      <div className="flex items-center space-x-1 min-w-max">
        {FUNCTION_KEYS.map((item) => {
          const isActive = item.assetClass && item.assetClass === activeAssetClass;
          return (
            <button
              key={item.key}
              onClick={() => handleClick(item)}
              aria-pressed={isActive ? true : undefined}
              aria-label={`${item.key} ${item.label}${isActive ? ' (active)' : ''}`}
              title={`${item.key}: ${item.label}`}
              className={`flex items-center space-x-1 px-1.5 py-1 rounded border transition-colors duration-100 min-h-[28px] focus-visible:outline-2 focus-visible:outline-amber-400 ${item.colorClass} ${
                isActive
                  ? 'bg-amber-500/20 border-amber-400 text-amber-300 shadow-[0_0_8px_rgba(255,153,0,0.3)]'
                  : 'bg-[#101622]/80 hover:border-zinc-500'
              }`}
            >
              <span className="text-[9px] font-bold opacity-60" aria-hidden="true">{item.key}</span>
              <span className="font-semibold tracking-wide">{item.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
});
