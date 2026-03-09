type Tier = {
  name: string;
  price: string;
  period: string;
  description: string;
  features: string[];
  buttonText: string;
  highlighted: boolean;
};

interface Props {
  onTierSelect?: (tier: 'basic' | 'pro' | 'enterprise') => void;
}

const PricingCard = ({ onTierSelect }: Props) => {
  const tiers: Tier[] = [
    {
      name: 'Basic',
      price: '$9',
      period: '/month',
      description: 'Perfect for individuals and small projects',
      features: [
        '5 projects',
        '10GB storage',
        'Email support',
        'Basic analytics',
        'API access',
      ],
      buttonText: 'Get Started',
      highlighted: false,
    },
    {
      name: 'Pro',
      price: '$29',
      period: '/month',
      description: 'Ideal for growing teams and businesses',
      features: [
        'Unlimited projects',
        '100GB storage',
        'Priority support',
        'Advanced analytics',
        'API access',
        'Custom integrations',
        'Team collaboration',
      ],
      buttonText: 'Start Free Trial',
      highlighted: true,
    },
    {
      name: 'Enterprise',
      price: '$99',
      period: '/month',
      description: 'For large organizations with advanced needs',
      features: [
        'Unlimited everything',
        '1TB storage',
        '24/7 dedicated support',
        'Enterprise analytics',
        'Full API access',
        'Custom integrations',
        'SSO & SAML',
        'SLA guarantee',
      ],
      buttonText: 'Contact Sales',
      highlighted: false,
    },
  ];

  const handleClick = (tierName: string) => {
    if (onTierSelect) {
      onTierSelect(tierName.toLowerCase() as 'basic' | 'pro' | 'enterprise');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 py-16 px-4">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-4xl font-bold text-white mb-4">
            Choose Your Plan
          </h2>
          <p className="text-slate-300 text-lg max-w-2xl mx-auto">
            Select the perfect plan for your needs. Upgrade or downgrade at any time.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-center">
          {tiers.map((tier, index) => (
            <div
              key={tier.name}
              className={`
                relative rounded-2xl p-8 transition-all duration-300 cursor-pointer
                ${tier.highlighted
                  ? 'bg-gradient-to-b from-purple-600 to-purple-800 scale-105 shadow-2xl shadow-purple-500/30 border-2 border-purple-400 z-10'
                  : 'bg-slate-800/80 hover:bg-slate-800 hover:scale-102 shadow-xl border border-slate-700 hover:border-purple-500/50'
                }
                hover:shadow-2xl hover:-translate-y-1
              `}
              onClick={() => handleClick(tier.name)}
            >
              {tier.highlighted && (
                <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                  <span className="bg-gradient-to-r from-yellow-400 to-orange-500 text-slate-900 text-sm font-bold px-4 py-1 rounded-full shadow-lg">
                    ⭐ RECOMMENDED
                  </span>
                </div>
              )}

              <div className="text-center mb-6">
                <h3 className={`text-2xl font-bold mb-2 ${tier.highlighted ? 'text-white' : 'text-slate-100'}`}>
                  {tier.name}
                </h3>
                <p className={`text-sm ${tier.highlighted ? 'text-purple-200' : 'text-slate-400'}`}>
                  {tier.description}
                </p>
              </div>

              <div className="text-center mb-8">
                <span className={`text-5xl font-extrabold ${tier.highlighted ? 'text-white' : 'text-slate-100'}`}>
                  {tier.price}
                </span>
                <span className={`text-lg ${tier.highlighted ? 'text-purple-200' : 'text-slate-400'}`}>
                  {tier.period}
                </span>
              </div>

              <ul className="space-y-3 mb-8">
                {tier.features.map((feature, featureIndex) => (
                  <li key={featureIndex} className="flex items-center gap-3">
                    <svg
                      className={`w-5 h-5 flex-shrink-0 ${tier.highlighted ? 'text-green-300' : 'text-green-500'}`}
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <span className={`text-sm ${tier.highlighted ? 'text-purple-100' : 'text-slate-300'}`}>
                      {feature}
                    </span>
                  </li>
                ))}
              </ul>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleClick(tier.name);
                }}
                className={`
                  w-full py-3 px-6 rounded-xl font-semibold text-lg transition-all duration-200
                  ${tier.highlighted
                    ? 'bg-white text-purple-700 hover:bg-slate-100 hover:shadow-lg'
                    : 'bg-purple-600 text-white hover:bg-purple-500 hover:shadow-lg hover:shadow-purple-500/30'
                  }
                  active:scale-95
                `}
              >
                {tier.buttonText}
              </button>
            </div>
          ))}
        </div>

        <div className="text-center mt-12">
          <p className="text-slate-400 text-sm">
            All plans include a 14-day free trial. No credit card required.
          </p>
        </div>
      </div>
    </div>
  );
};

export { PricingCard };
export default PricingCard;