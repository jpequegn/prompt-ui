type Props = {
  logoSrc?: string;
  logoAlt?: string;
  onNavigate?: (path: string) => void;
};

const NavigationBar = ({
  logoSrc = "/logo.svg",
  logoAlt = "Company Logo",
  onNavigate,
}: Props) => {
  const navLinks = [
    { label: "Home", path: "/home" },
    { label: "About", path: "/about" },
    { label: "Services", path: "/services" },
    { label: "Contact", path: "/contact" },
  ];

  const handleClick = (path: string) => {
    if (onNavigate) {
      onNavigate(path);
    }
  };

  return (
    <nav className="flex items-center justify-between px-6 py-4 bg-white shadow-md">
      <div className="flex items-center">
        <img
          src={logoSrc}
          alt={logoAlt}
          className="h-10 w-auto object-contain"
        />
      </div>

      <div className="flex items-center space-x-8">
        {navLinks.map((link) => (
          <a
            key={link.path}
            href={link.path}
            onClick={(e) => {
              e.preventDefault();
              handleClick(link.path);
            }}
            className="text-gray-700 font-medium hover:text-blue-600 transition-colors duration-200 text-sm uppercase tracking-wide"
          >
            {link.label}
          </a>
        ))}
      </div>
    </nav>
  );
};

export { NavigationBar };
export default NavigationBar;