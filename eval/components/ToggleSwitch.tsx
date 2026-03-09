type Props = {
  label?: string;
  defaultChecked?: boolean;
  disabled?: boolean;
  onChange?: (checked: boolean) => void;
};

export const ToggleSwitch = ({
  label = "Toggle",
  defaultChecked = false,
  disabled = false,
  onChange,
}: Props) => {
  const [isOn, setIsOn] = React.useState(defaultChecked);

  const handleToggle = () => {
    if (disabled) return;
    const newValue = !isOn;
    setIsOn(newValue);
    onChange?.(newValue);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleToggle();
    }
  };

  return (
    <div className="flex items-center gap-4">
      <span
        className={`text-sm font-medium ${
          disabled ? "text-gray-400" : "text-gray-700"
        }`}
      >
        {label}
      </span>

      <button
        type="button"
        role="switch"
        aria-checked={isOn}
        aria-label={`${label} toggle switch`}
        disabled={disabled}
        onClick={handleToggle}
        onKeyDown={handleKeyDown}
        className={`
          relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent 
          transition-colors duration-200 ease-in-out
          focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
          ${isOn ? "bg-blue-600" : "bg-gray-200"}
          ${disabled ? "cursor-not-allowed opacity-50" : ""}
        `}
      >
        <span
          className={`
            pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 
            transition duration-200 ease-in-out
            ${isOn ? "translate-x-5" : "translate-x-0"}
          `}
        />
      </button>

      <span
        className={`
          min-w-8 text-sm font-semibold
          ${disabled ? "text-gray-400" : isOn ? "text-blue-600" : "text-gray-500"}
          transition-colors duration-200
        `}
      >
        {isOn ? "On" : "Off"}
      </span>
    </div>
  );
};

export default ToggleSwitch;