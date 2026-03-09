type Props = {
  progress: number;
  trackColor?: string;
  fillColor?: string;
  showLabel?: boolean;
  labelPosition?: 'inside' | 'outside';
  height?: 'sm' | 'md' | 'lg';
  animated?: boolean;
};

export const ProgressBar = ({
  progress,
  trackColor = 'bg-gray-200',
  fillColor = 'bg-blue-500',
  showLabel = true,
  labelPosition = 'outside',
  height = 'md',
  animated = true,
}: Props) => {
  const percent = Math.min(100, Math.max(0, progress));
  
  const heightClasses = {
    sm: 'h-2',
    md: 'h-4',
    lg: 'h-6',
  };

  const barHeight = heightClasses[height];
  
  const transitionClass = animated ? 'transition-all duration-500 ease-out' : '';

  return (
    <div className="w-full">
      <div className="flex items-center gap-3">
        <div
          className={`relative flex-1 ${barHeight} ${trackColor} rounded-full overflow-hidden`}
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Progress: ${percent}%`}
        >
          <div
            className={`absolute top-0 left-0 h-full ${fillColor} rounded-full ${transitionClass}`}
            style={{ width: `${percent}%` }}
          >
            {showLabel && labelPosition === 'inside' && height !== 'sm' && (
              <span className="absolute inset-0 flex items-center justify-center text-xs font-semibold text-white">
                {percent >= 15 ? `${Math.round(percent)}%` : ''}
              </span>
            )}
          </div>
        </div>
        
        {showLabel && labelPosition === 'outside' && (
          <span className="text-sm font-medium text-gray-700 min-w-[3rem] text-right">
            {Math.round(percent)}%
          </span>
        )}
      </div>
    </div>
  );
};

export default ProgressBar;