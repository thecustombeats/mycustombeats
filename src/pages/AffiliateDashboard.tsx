import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

export default function AffiliateDashboard() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      const email = localStorage.getItem("affiliate_email");

      if (!email) {
        window.location.href = "/affiliate";
        return;
      }

      const { data, error } = await supabase
  .from("affiliates")
  .select("*")
  .eq("email", email);

console.log("EMAIL:", email);
console.log("DATA:", data);
console.log("ERROR:", error);

      if (error) {
  console.error("Supabase error:", error);
  setLoading(false);
  return;
}

if (!data || data.length === 0) {
  console.log("No user found");
  setLoading(false);

  if (!data) {
  return (
    <div className="min-h-screen flex items-center justify-center">
      No affiliate found. Please sign up again.
    </div>
  );
}
  return;
}

setData(data[0]);
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