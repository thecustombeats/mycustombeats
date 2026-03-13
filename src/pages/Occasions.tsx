import React from "react";

export default function Occasions() {

const occasions = [
{
title: "Birthday Songs",
desc: "Create a fun personalized birthday song gift."
},
{
title: "Anniversary Songs",
desc: "Celebrate love with a romantic custom song."
},
{
title: "Wedding Songs",
desc: "Make your first dance unforgettable."
},
{
title: "Proposal Songs",
desc: "Propose with a beautiful custom love song."
},
{
title: "Cruise Songs",
desc: "Capture your cruise memories forever."
}
];

return (

<section className="py-20 bg-black text-white">

<div className="max-w-6xl mx-auto text-center">

<h1 className="text-4xl font-bold mb-12">
Songs for Every Occasion
</h1>

<div className="grid md:grid-cols-2 gap-8">

{occasions.map((item,index)=>(
<div key={index} className="border border-gold p-8 rounded-xl">

<h2 className="text-2xl mb-3">{item.title}</h2>

<p className="opacity-80">{item.desc}</p>

<a
 href="/#order"
 className="mt-5 inline-block bg-gold text-black px-5 py-2 rounded"
>
Create Your Song
</a>

</div>
))}

</div>

</div>

</section>

);

}