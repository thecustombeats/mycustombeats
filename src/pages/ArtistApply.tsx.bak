import { useState, useEffect } from "react";
import ReCAPTCHA from "react-google-recaptcha";

const ArtistApply = () => {

  const [name,setName] = useState("")
  const [email,setEmail] = useState("")
  const [genre,setGenre] = useState("")
  const [country,setCountry] = useState("")
  const [portfolio,setPortfolio] = useState("")
  const [message,setMessage] = useState("")
  const [captchaValue,setCaptchaValue] = useState<string | null>(null)

  // prevents captcha crash on initial render
  const [captchaReady,setCaptchaReady] = useState(false)

  useEffect(()=>{
    setCaptchaReady(true)
  },[])

  const handleSubmit = async (e:any) => {
    e.preventDefault()

    if(!captchaValue){
      alert("Please verify you're not a robot")
      return
    }

    const data = {
      type:"artist",
      name,
      email,
      genre,
      country,
      portfolio,
      message
    }

    try{
      await fetch("https://new-form-project-54e58b.zapier.app/",{
  method:"POST",
  headers:{
    "Content-Type":"application/json"
  },
  body:JSON.stringify(data)
})

window.location.href = "/artist-thank-you"

      // reset form
      setName("")
      setEmail("")
      setGenre("")
      setCountry("")
      setPortfolio("")
      setMessage("")
      setCaptchaValue(null)

    }catch(error){
      alert("Something went wrong. Please try again.")
    }
  }

  return (
    <section className="py-24 px-[7vw] max-w-4xl mx-auto">

      <h1 className="text-4xl font-serif text-espresso mb-6">
        Apply as an Artist
      </h1>

      <p className="text-espresso/70 mb-10">
        Join our network of talented musicians creating custom songs for clients around the world.
      </p>

      <form onSubmit={handleSubmit} className="space-y-6">

        <input
          type="text"
          placeholder="Full Name"
          value={name}
          onChange={(e)=>setName(e.target.value)}
          className="w-full border rounded-lg px-4 py-3"
          required
        />

        <input
          type="email"
          placeholder="Business Email"
          value={email}
          onChange={(e)=>setEmail(e.target.value)}
          className="w-full border rounded-lg px-4 py-3"
          required
        />

        <input
          type="text"
          placeholder="Country"
          value={country}
          onChange={(e)=>setCountry(e.target.value)}
          className="w-full border rounded-lg px-4 py-3"
        />

        <input
          type="text"
          placeholder="Genre / Style"
          value={genre}
          onChange={(e)=>setGenre(e.target.value)}
          className="w-full border rounded-lg px-4 py-3"
        />

        <input
          type="text"
          placeholder="Share links to your music (SoundCloud, YouTube, Spotify)"
          value={portfolio}
          onChange={(e)=>setPortfolio(e.target.value)}
          className="w-full border rounded-lg px-4 py-3"
        />

        <textarea
          placeholder="Tell us about yourself"
          value={message}
          onChange={(e)=>setMessage(e.target.value)}
          className="w-full border rounded-lg px-4 py-3 h-32"
        />

        {captchaReady && (
          <ReCAPTCHA
            sitekey="6Lf9XZMsAAAAAKOCR1dAAWpr_gFb2UwlM0W8PDZD"
            onChange={(value)=>setCaptchaValue(value)}
          />
        )}

        <button
          className="px-8 py-3 bg-gold text-espresso rounded-full hover:bg-espresso hover:text-ivory"
        >
          Submit Application
        </button>

      </form>

    </section>
  )
}

export default ArtistApply