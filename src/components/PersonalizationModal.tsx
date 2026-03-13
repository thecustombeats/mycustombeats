import { useState, useEffect } from 'react';
import { X, User, Heart, Users, Gift, Home } from 'lucide-react';

interface PersonalizationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (type: string) => void;
}

const visitorTypes = [
  { id: 'solo', label: 'Myself', icon: User, description: 'A solo journey of discovery' },
  { id: 'partner', label: 'My Partner', icon: Heart, description: 'Romance and togetherness' },
  { id: 'friends', label: 'Friends Trip', icon: Users, description: 'Celebration and fun' },
  { id: 'family', label: 'Family', icon: Home, description: 'Memories with loved ones' },
  { id: 'gift', label: 'A Gift', icon: Gift, description: 'For someone special' },
];

const PersonalizationModal = ({ isOpen, onClose, onSelect }: PersonalizationModalProps) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
    } else {
      const timer = setTimeout(() => setIsVisible(false), 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  if (!isVisible) return null;

  return (
    <div 
      className={`fixed inset-0 z-[2000] flex items-center justify-center p-4 transition-all duration-300 ${
        isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}
    >
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-espresso/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div 
        className={`relative bg-ivory rounded-3xl shadow-2xl max-w-lg w-full p-8 transition-all duration-300 ${
          isOpen ? 'scale-100 translate-y-0' : 'scale-95 translate-y-4'
        }`}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-10 h-10 rounded-full bg-misty-stone flex items-center justify-center text-espresso/60 hover:text-espresso transition-colors"
          aria-label="Close"
        >
          <X size={20} />
        </button>

        {/* Content */}
        <div className="text-center mb-8">
          <span className="label-uppercase text-gold mb-3 block tracking-[0.15em]">
            Personalize Your Experience
          </span>
          <h3 className="font-serif text-2xl text-espresso mb-2">
            Who is this song for?
          </h3>
          <p className="text-espresso/60" style={{ fontFamily: 'Arimo, sans-serif' }}>
            We'll tailor the experience to match your journey
          </p>
        </div>

        {/* Options */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {visitorTypes.map((type) => {
            const Icon = type.icon;
            return (
              <button
                key={type.id}
                onClick={() => onSelect(type.id)}
                className="group flex items-center gap-4 p-4 bg-white rounded-xl shadow-sm hover:shadow-luxury hover:-translate-y-0.5 transition-all duration-fast text-left"
              >
                <div className="w-12 h-12 rounded-xl bg-gold/10 flex items-center justify-center group-hover:bg-gold transition-colors duration-fast">
                  <Icon size={22} className="text-gold group-hover:text-espresso transition-colors duration-fast" />
                </div>
                <div>
                  <span className="block font-medium text-espresso" style={{ fontFamily: 'Arimo, sans-serif' }}>
                    {type.label}
                  </span>
                  <span className="text-xs text-espresso/50">
                    {type.description}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Skip option */}
        <button
          onClick={onClose}
          className="w-full mt-6 text-sm text-espresso/50 hover:text-espresso transition-colors"
          style={{ fontFamily: 'Arimo, sans-serif' }}
        >
          Skip for now
        </button>
      </div>
    </div>
  );
};

export default PersonalizationModal;
