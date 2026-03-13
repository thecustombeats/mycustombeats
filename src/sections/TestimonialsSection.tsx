import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Quote } from "lucide-react";

gsap.registerPlugin(ScrollTrigger);

const testimonials = [
  {
    id: "1",
    quote: "Our girls trip deserved more than photos. This became our anthem.",
    author: "Sarah M.",
    role: "Cruise Guest",
    location: "Mediterranean Voyage",
  },
  {
    id: "2",
    quote: "I gave it as a birthday gift. She cried within ten seconds.",
    author: "James T.",
    role: "Gift Buyer",
    location: "Anniversary Cruise",
  },
  {
    id: "3",
    quote: "A keepsake I will replay every time I miss that sunset.",
    author: "Emma L.",
    role: "Solo Traveler",
    location: "Caribbean Journey",
  },
  {
    id: "4",
    quote:
      "The perfect soundtrack for our yacht charter in the Amalfi Coast. Pure magic.",
    author: "Alexandra R.",
    role: "Yacht Charter Guest",
    location: "Amalfi Coast",
  },
  {
    id: "5",
    quote:
      "We played our song as we sailed into Monaco. It was the highlight of our trip.",
    author: "Michael & Diana K.",
    role: "Yacht Guests",
    location: "French Riviera",
  },
  {
    id: "6",
    quote:
      "From private jet to paradise, our song captured every moment of luxury.",
    author: "Victoria S.",
    role: "Luxury Traveler",
    location: "Maldives Charter Flight",
  },
  {
    id: "7",
    quote:
      "A song that reminds us of the moment we said yes to forever, 30,000 feet in the air.",
    author: "Thomas & Olivia H.",
    role: "Private Jet Passengers",
    location: "Transatlantic Flight",
  },
];

const TestimonialsSection = () => {
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const ctx = gsap.context(() => {
      /* Heading Animation */
      gsap.fromTo(
        ".testimonials-heading",
        { y: 30, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.5,
          ease: "power2.out",
          scrollTrigger: {
            trigger: section,
            start: "top 80%",
          },
        }
      );

      /* Card Animation */
      gsap.fromTo(
        ".testimonial-card",
        { y: 60, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.5,
          stagger: 0.1,
          ease: "power2.out",
          scrollTrigger: {
            trigger: ".testimonials-scroll",
            start: "top 85%",
          },
        }
      );
    }, section);

    const scrollContainer = section.querySelector(
      ".testimonials-scroll"
    ) as HTMLDivElement;

    if (!scrollContainer) return;

    /* Auto Scroll */
    let autoScroll: any;

     const checkLoop = () => {
  if (
    scrollContainer.scrollLeft >=
    scrollContainer.scrollWidth / 2
  ) {
    scrollContainer.scrollLeft = 0;
  }
};

const startAutoScroll = () => {

      autoScroll = setInterval(() => {
  scrollContainer.scrollLeft += 1;
  checkLoop();
}, 30);
    };

    const stopAutoScroll = () => {
      clearInterval(autoScroll);
    };

    startAutoScroll();

    /* Pause on hover */
    scrollContainer.addEventListener("mouseenter", stopAutoScroll);
    scrollContainer.addEventListener("mouseleave", startAutoScroll);

    /* Mouse wheel horizontal scroll */
    scrollContainer.addEventListener("wheel", (e: any) => {
      if (e.deltaY !== 0) {
        e.preventDefault();
        scrollContainer.scrollLeft += e.deltaY;
      }
    });


    return () => {
      ctx.revert();
      clearInterval(autoScroll);
    };
  }, []);

const duplicatedTestimonials = [...testimonials, ...testimonials];

  return (
    <section
      ref={sectionRef}
      id="testimonials"
      className="relative w-full bg-misty-stone py-24"
    >
      <div className="px-[7vw]">
        {/* Heading */}
        <div className="testimonials-heading text-center mb-16">
          <span className="label-uppercase text-gold mb-4 block tracking-[0.15em]">
            Testimonials
          </span>

          <h2 className="font-serif text-espresso">
            What travelers are saying
          </h2>
        </div>
      </div>

      {/* Scroll Area */}
      <div className="relative">
        {/* Fade Left */}
        <div className="pointer-events-none absolute left-0 top-0 h-full w-16 bg-gradient-to-r from-misty-stone to-transparent z-10" />

        {/* Fade Right */}
        <div className="pointer-events-none absolute right-0 top-0 h-full w-16 bg-gradient-to-l from-misty-stone to-transparent z-10" />


<div className="testimonials-scroll flex gap-8 overflow-x-auto pb-6 px-[7vw] snap-x snap-mandatory">
  
  {duplicatedTestimonials.map((testimonial, index) => (
    <div
      key={`${testimonial.id}-${index}`}
      className="testimonial-card snap-start bg-white rounded-2xl shadow-luxury p-6 min-w-[420px] max-w-[420px]"
    >

              <div className="w-10 h-10 rounded-xl bg-gold/10 flex items-center justify-center mb-4">
                <Quote size={18} className="text-gold" />
              </div>

              <blockquote className="font-serif text-base text-espresso mb-6 leading-relaxed">
                "{testimonial.quote}"
              </blockquote>

              <div className="hairline mb-4" />

              <div>
                <p
                  className="font-medium text-espresso text-sm"
                  style={{ fontFamily: "Arimo, sans-serif" }}
                >
                  {testimonial.author}
                </p>

                <p className="text-xs text-espresso/50 mb-1">
                  {testimonial.role}
                </p>

                <span className="text-xs text-gold uppercase tracking-wider">
                  {testimonial.location}
                </span>
              </div>
            </div>
          ))}

        </div> {/* testimonials-scroll */}
      </div>   {/* scroll wrapper */}
    </section>
  );
};

export default TestimonialsSection;