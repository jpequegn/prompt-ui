type Props = {
  message: string;
  onDismiss: () => void;
  autoDismissMs?: number;
};

const SuccessToast: React.FC<Props> = ({ message, onDismiss, autoDismissMs = 5000 }) => {
  const [isVisible, setIsVisible] = React.useState(false);
  const [isLeaving, setIsLeaving] = React.useState(false);

  React.useEffect(() => {
    // Trigger fade-in on mount
    const fadeInTimer = setTimeout(() => setIsVisible(true), 10);
    return () => clearTimeout(fadeInTimer);
  }, []);

  React.useEffect(() => {
    if (autoDismissMs > 0) {
      const autoDismissTimer = setTimeout(() => {
        handleDismiss();
      }, autoDismissMs);
      return () => clearTimeout(autoDismissTimer);
    }
  }, [autoDismissMs]);

  const handleDismiss = () => {
    setIsLeaving(true);
    setTimeout(() => {
      onDismiss();
    }, 300);
  };

  return (
    <div
      className={`
        fixed top-4 right-4 z-50
        flex items-center gap-3
        bg-green-50 border border-green-200 rounded-lg shadow-lg
        px-4 py-3 min-w-72 max-w-md
        transition-all duration-300 ease-in-out
        ${isVisible && !isLeaving ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-4'}
      `}
      role="alert"
      aria-live="polite"
    >
      {/* Green Checkmark Icon */}
      <div className="flex-shrink-0 w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
        <svg
          className="w-4 h-4 text-white"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={3}
            d="M5 13l4 4L19 7"
          />
        </svg>
      </div>

      {/* Success Message Text */}
      <p className="flex-1 text-green-800 font-medium text-sm">
        {message}
      </p>

      {/* Dismiss Button with Close Icon */}
      <button
        onClick={handleDismiss}
        className="
          flex-shrink-0 p-1 rounded-md
          text-green-600 hover:text-green-800
          hover:bg-green-100 
          transition-colors duration-200
          focus:outline-none focus:ring-2 focus:ring-green-400 focus:ring-offset-1
        "
        aria-label="Dismiss notification"
        type="button"
      >
        <svg
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </button>

      {/* Progress bar for auto-dismiss */}
      {autoDismissMs > 0 && (
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-green-100 rounded-b-lg overflow-hidden">
          <div
            className="h-full bg-green-400 rounded-b-lg"
            style={{
              animation: `shrink ${autoDismissMs}ms linear forwards`,
            }}
          />
          <style>
            {`
              @keyframes shrink {
                from { width: 100%; }
                to { width: 0%; }
              }
            `}
          </style>
        </div>
      )}
    </div>
  );
};

export { SuccessToast };
export default SuccessToast;