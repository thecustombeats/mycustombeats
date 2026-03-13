import { Link } from "react-router-dom";

export default function Refund() {
  return (
    <div className="min-h-screen bg-espresso text-ivory px-6 py-20">
      <div className="max-w-4xl mx-auto space-y-8">
        <h1 className="text-3xl font-light tracking-wide text-gold">
          Refund Policy
        </h1>

        <div className="space-y-6 text-ivory/70">
          <div>
            <h3 className="text-gold mb-2">1. Digital Product Nature</h3>
            <p>
              All products offered are custom digital music creations tailored specifically to you.
            </p>
          </div>

          <div>
            <h3 className="text-gold mb-2">2. No Refunds After Production</h3>
            <p>
              Due to the personalized nature of our services, refunds are not available once production has begun.
            </p>
          </div>
        </div>

        <div className="mt-12">
          <Link
            to="/"
            className="inline-block px-6 py-3 border border-gold text-gold hover:bg-gold hover:text-espresso transition-all duration-300 text-sm"
          >
            ← Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}