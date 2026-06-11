import { X, User, Heart, Users, Gift, Home } from 'lucide-react';


interface PersonalizationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (type: string) => void;
}

const visitorTypes = [
  { id: 'solo', label: 'For Myself', icon: User, description: 'A song about my journey' },
  { id: 'partner', label: 'For My Partner', icon: Heart, description: 'A love story in music' },
  { id: 'friends', label: 'For Friends', icon: Users, description: 'Moments of joy and celebration' },
  { id: 'family', label: 'For Family', icon: Home, description: 'Memories that last forever' },
  { id: 'gift', label: 'As a Gift', icon: Gift, description: 'A surprise they’ll never forget' },
];

const PersonalizationModal = ({ isOpen, onClose, onSelect }: PersonalizationModalProps) => {

  // 👉 This prevents rendering when closed
  if (!isOpen) return null;

  return (
    <div 
      className={`fixed inset-0 z-[2000] flex items-center justify-center p-4 transition-all duration-500 ease-out ${
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
        className={`relative bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl max-w-lg w-full p-10 transition-all duration-300 ${
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
          <span className="label-uppercase text-gold mb-3 block tracking-[0.2em]">
            BEGIN YOUR STORY
          </span>
          <h3 className="font-serif text-2xl text-espresso mb-2">
            Who is this song meant for?
          </h3>
          <p className="text-espresso/60">
            We’ll shape the experience around your story
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
                className="group flex items-center gap-4 p-5 bg-white/80 border border-black/5 rounded-2xl hover:shadow-xl hover:-translate-y-1 transition-all duration-300 text-left"
              >
                <div className="w-12 h-12 rounded-xl bg-gold/10 flex items-center justify-center group-hover:bg-gold transition-colors duration-fast">
                  <Icon size={22} className="text-gold group-hover:text-espresso transition-colors duration-fast" />
                </div>
                <div>
                  <span className="block font-medium text-espresso">
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

        {/* Skip */}
        <button
          onClick={onClose}
          className="w-full mt-6 text-sm text-espresso/50 hover:text-espresso transition-colors"
        >
          I’ll explore first
        </button>
      </div>
    </div>
  );
};

export default PersonalizationModal;