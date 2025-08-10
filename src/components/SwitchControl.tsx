
import React from 'react';
import { Button } from '@/components/ui/button';
import { ToggleLeft, ToggleRight, Zap, Radar } from 'lucide-react';
import { cn } from '@/lib/utils';

import { Switch as DeviceSwitch } from '@/types';

interface SwitchControlProps {
  switch: DeviceSwitch;
  onToggle: () => void;
  disabled?: boolean;
  isPirActive?: boolean;
}

export const SwitchControl: React.FC<SwitchControlProps> = ({ 
  switch: switchData, 
  onToggle, 
  disabled = false,
  isPirActive = false
}) => {
  const getSwitchTypeIcon = (type: string) => {
    switch (type) {
      case 'light': return '💡';
      case 'fan': return '🌪️';
      case 'projector': return '📽️';
      case 'ac': return '❄️';
      case 'smartboard': return '📱';
      case 'speaker': return '🔊';
      default: return '⚡';
    }
  };

  return (
    <Button
      variant="ghost"
      onClick={onToggle}
      disabled={disabled}
      className={cn(
        "switch-toggle h-auto p-4 flex flex-col items-center gap-3 border-2 rounded-lg transition-all duration-300",
        switchData.state 
          ? "switch-on border-green-500 bg-green-100 shadow-lg text-green-800" 
          : "switch-off border-red-300 bg-red-50 text-red-600 hover:border-red-400",
        disabled && "opacity-50 cursor-not-allowed",
        "hover:scale-105"
      )}
    >
      <div className="flex items-center gap-3">
        <div className={cn(
          "p-3 rounded-full transition-colors text-xl",
          switchData.state 
            ? "bg-green-500 text-white" 
            : "bg-red-100 text-red-500"
        )}>
          {getSwitchTypeIcon(switchData.type)}
        </div>
        
        <div className="transition-transform duration-200">
          {switchData.state ? (
            <div className="flex items-center gap-2">
              <ToggleRight className="w-8 h-8 text-green-500" />
              <span className="text-sm font-bold text-green-600">ON</span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <ToggleLeft className="w-8 h-8 text-red-400" />
              <span className="text-sm font-bold text-red-500">OFF</span>
            </div>
          )}
        </div>
      </div>
      
      <div className="text-center space-y-1">
        <p className="text-sm font-medium">{switchData.name}</p>
  <p className="text-xs text-muted-foreground">GPIO {(switchData as any).relayGpio ?? (switchData as any).gpio}</p>
        
        {switchData.usePir && (
          <div className="flex items-center justify-center gap-1 text-xs">
            <Radar className={cn(
              "w-3 h-3",
              isPirActive ? "text-green-500" : "text-muted-foreground"
            )} />
            <span className={cn(
              isPirActive ? "text-green-500" : "text-muted-foreground"
            )}>
              PIR {isPirActive ? "Active" : "Idle"}
            </span>
          </div>
        )}
        
        {switchData.dontAutoOff && (
          <div className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded">
            Manual Override
          </div>
        )}
      </div>
    </Button>
  );
};
