import { useState } from "react";
import { Helmet } from "react-helmet-async";
import QRCode from "react-qr-code";
import emailjs from "emailjs-com";
import { supabase } from "../lib/supabaseClient";

export default function Affiliate() {
  const [link, setLink] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const cleanUsername = (value: string) => {
    return value
      .toLowerCase()
      .replace(/\s+/g, "")
      .replace(/[^a-z0-9]/g, "");
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    setMessage("");
    setLoading(true);

    const form = e.currentTarget;

    const name = (form.elements.namedItem("name") as HTMLInputElement).value.trim();
    const email = (form.elements.namedItem("email") as HTMLInputElement).value.trim();

    let username = (form.elements.namedItem("username") as HTMLInputElement).value;

    username = cleanUsername(username || name);

    // ✅ CHECK DUPLICATES IN SUPABASE
const { data: existing, error: checkError } = await supabase
  .from("affiliates")
  .select("*")
  .or(`email.eq.${email},username.eq.${username}`)

if (checkError) {
  console.error(checkError);
  setMessage("❌ Error checking existing users");
  setLoading(false);
  return;
}

if (existing && existing.length > 0) {
  setMessage("❌ Email or username already exists. Try another one.");
  setLoading(false);
  return;
}

if (!email.includes("@") || email.length < 6) {
  setMessage("Enter a valid email");
  return;
}

    const referralLink = `${window.location.origin}/?ref=${username}`;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${referralLink}`;

    const { error: insertError } = await supabase.from("affiliates").insert([
  {
    name,
    email,
    username,
    referral_link: referralLink,
    clicks: 0,
    sales: 0,
    expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  },
]);

if (insertError) {
  console.error(insertError);
  setMessage("❌ Failed to save affiliate");
  setLoading(false);
  return;
}

const blockedDomains = ["tempmail.com", "10minutemail.com"];

const domain = email.split("@")[1];

if (blockedDomains.includes(domain)) {
  setMessage("Temporary emails are not allowed");
  return;
}

    try {
      // ✅ SEND TO GOOGLE SHEETS (NO RESPONSE EXPECTED)
      await fetch(
        "https://script.google.com/macros/s/AKfycbxJ9ZE2MjCrmcA1zqpSLZjcxA1jz82KQ_auVU28LQPjbicxBhKkgY9IlTAXazp4i0Gj/exec",
        {
          method: "POST",
          mode: "no-cors", // 🔥 important
          body: JSON.stringify({
            name,
            email,
            username,
            link: referralLink,
          }),
        }
      );

      // ✅ SET LINK
      setLink(referralLink);

      // ✅ SEND EMAIL
      await emailjs.send(
  "service_3q0yt7b",
  "template_oatpxgh",
  {
    name,
    email,
    link: referralLink,
    qr: qrUrl,
  },
  "aTFVXXN9nbVIifl-5"
);
      
      setMessage("✅ Your referral link has been sent to your email!");

      localStorage.setItem("affiliate_email", email);

      window.location.href = "/dashboard";

    } catch (err) {
      console.error(err);
      setMessage("❌ Something went wrong. Please try again.");
    }

    setLoading(false);
  };

  const copyLink = () => {
    navigator.clipboard.writeText(link);
    setMessage("✅ Copied to clipboard!");
  };

  return (
    <>
      <Helmet>
        <title>Affiliate Program | My Custom Beats</title>
      </Helmet>

      <div className="bg-[#FBF9F6] text-black">

        {/* HERO */}
        <section className="pt-40 pb-16 text-center px-6">
          <h1 className="text-5xl md:text-7xl font-light mb-6">
            Earn With Us
          </h1>

          <p className="text-black/60 max-w-2xl mx-auto">
            Share meaningful music experiences and earn commission.
          </p>
        </section>

        {/* FORM */}
        <section className="max-w-2xl mx-auto px-6 pb-24">
          <div className="bg-white rounded-2xl p-8 shadow-sm border">

            <form onSubmit={handleSubmit} className="space-y-5">

              <input
                name="name"
                placeholder="Your Full Name"
                required
                className="w-full p-4 rounded-xl border"
              />

              <input
                name="email"
                type="email"
                placeholder="Your Email"
                required
                className="w-full p-4 rounded-xl border"
              />

              <div>
                <input
                  name="username"
                  placeholder="Create your referral name (e.g. john123)"
                  className="w-full p-4 rounded-xl border"
                />

                <div className="text-sm text-black/50 mt-5">
  <p>* This is your personal code.</p>
  <p>* Do NOT enter someone else's name.</p>
</div>
</div>
              <button
                disabled={loading}
                className="w-full py-4 bg-gold rounded-full"
              >
                {loading ? "Creating..." : "Get My Referral Link"}
              </button>

              {message && (
                <p className="text-center text-sm mt-2">{message}</p>
              )}

            </form>

            {/* RESULT */}
            {link && (
              <div className="mt-10 text-center">

                <input
                  value={link}
                  readOnly
                  className="w-full p-3 border rounded-xl text-center"
                />

                <button
                  onClick={copyLink}
                  className="mt-4 px-6 py-2 bg-black text-white rounded-full"
                >
                  Copy Link
                </button>

                <div className="mt-6 flex justify-center">
                  <QRCode value={link} size={140} />
                </div>

              </div>
            )}

          </div>
        </section>

      </div>
    </>
  );
}