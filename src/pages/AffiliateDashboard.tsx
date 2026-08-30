import { useEffect, useState } from "react";

export default function AffiliateDashboard() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      // The token is the credential. The previous version read an email from
      // localStorage and fetched whoever it named, so anyone who knew an
      // affiliate's address could open their dashboard.
      const token = localStorage.getItem("affiliate_token");

      if (!token) {
        window.location.href = "/affiliate";
        return;
      }

      try {
        const response = await fetch("/api/affiliate/dashboard", {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (response.status === 401) {
          // Expired or superseded — send them back to request a new link.
          localStorage.removeItem("affiliate_token");
          setError("Your dashboard link has expired. Please sign up again to receive a new one.");
          setLoading(false);
          return;
        }

        if (!response.ok) {
          setError("We couldn't load your dashboard. Please try again shortly.");
          setLoading(false);
          return;
        }

        setData(await response.json());
      } catch {
        setError("We couldn't reach the server. Please check your connection.");
      }

      setLoading(false);
    };

    loadData();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        Loading dashboard...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-ivory flex items-center justify-center px-6 text-center">
        <div className="max-w-md">
          <p className="text-espresso/80 mb-6">
            {error ?? "No affiliate found. Please sign up again."}
          </p>
          <a
            href="/affiliate"
            className="inline-block px-7 py-3 text-[11px] tracking-[0.2em] uppercase rounded-full bg-ink text-ivory hover:bg-gold hover:text-ink transition-colors duration-300"
          >
            Go to sign up
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FBF9F6] text-black p-6">

      <h1 className="text-4xl font-light mb-6 text-center">
        Your Affiliate Dashboard
      </h1>

      <div className="max-w-xl mx-auto bg-white p-6 rounded-2xl shadow">

        <p><strong>Name:</strong> {data.name}</p>
        <p><strong>Email:</strong> {data.email}</p>

        <p className="mt-4"><strong>Your Link:</strong></p>

        <input
          value={data.referral_link}
          readOnly
          className="w-full p-3 border rounded-xl text-center mt-2"
        />

        <div className="grid grid-cols-3 gap-4 text-center mt-6">

          <div className="bg-[#FBF9F6] p-4 rounded-xl">
            <p className="text-sm text-black/60">Clicks</p>
            <p className="text-2xl font-semibold">{data.clicks || 0}</p>
          </div>

          <div className="bg-[#FBF9F6] p-4 rounded-xl">
            <p className="text-sm text-black/60">Sales</p>
            <p className="text-2xl font-semibold">{data.sales || 0}</p>
          </div>

          <div className="bg-[#FBF9F6] p-4 rounded-xl">
            <p className="text-sm text-black/60">Conversion</p>
            <p className="text-2xl font-semibold">
              {data.clicks > 0
                ? ((data.sales / data.clicks) * 100).toFixed(1) + "%"
                : "0%"}
            </p>
          </div>

{data.clicks === 0 && (
  <p className="mt-6 text-sm text-center italic text-espresso/70">
    Note: You’re all set — start sharing your link to earn your first commission.  
    Top affiliates earn £500+ per cruise.
  </p>
)}

        </div>

      </div>
    </div>
  );
}