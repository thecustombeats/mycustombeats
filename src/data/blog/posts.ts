/**
 * MCB blog articles.
 *
 * WRITING RULES (tests/operations.test.mjs reads every word):
 *   • No statistics, survey figures or research claims.
 *   • No testimonials, reviews, customer quotes or named customers.
 *   • No endorsements, partnerships or cruise-line names.
 *   • No guarantees. Product facts and timings come from the catalogue and
 *     the delivery policy constants, so an article cannot drift from them.
 *   • Helpful first; one natural call to action.
 */

import { JOURNEY, KEEPSAKE, MOMENT } from "../catalogue";
import { RECOMMENDED_PLANNING_DAYS } from "../legal/delivery";
import { STORY_MAX } from "../personalisationRules";
import type { BlogPost } from "./types";

const MCB = { type: "Organization", name: "My Custom Beats" } as const;

const keepsakeSizes = KEEPSAKE.variants.map((v) => v.label).join(", ").replace(/, ([^,]*)$/, " and $1");

export const BLOG_POSTS: readonly BlogPost[] = [
  {
    slug: "turn-a-special-memory-into-a-personalised-song",
    title: "How to Turn a Special Memory Into a Personalised Song",
    excerpt:
      "A practical guide to choosing the memory, finding the details that matter, and giving a songwriter what they need to make a song that sounds like your story.",
    heroImage: "travelJournal",
    publishedAt: "2026-09-14",
    updatedAt: "2026-09-14",
    author: MCB,
    categories: ["Personalised songs", "Gift ideas"],
    seoTitle: "How to Turn a Special Memory Into a Personalised Song | My Custom Beats",
    metaDescription:
      "How to choose a memory, pick out the details that matter and describe it so a personalised song feels like yours — a practical, step-by-step guide.",
    related: ["preserve-cruise-memories-after-you-return-home", "picture-disc-keepsakes-music-and-memories-you-can-hold"],
    cta: {
      heading: "Ready to tell us your memory?",
      text: "Share the story in your own words and choose a style — we'll write and produce the song.",
      label: "Create your memory",
      to: "/create",
    },
    content: [
      { type: "p", text: "Most people know the moment straight away: the first dance, the night the whole family finally sat around one table, the view from the deck on the last evening of a trip. What is harder is knowing how to describe it so that a song written from it sounds like yours and nobody else's." },
      { type: "p", text: "This guide walks through how to choose the memory, find the details that matter, and hand it over in a way that gives a songwriter something real to work with. You do not need to write lyrics, rhyme anything or know anything about music." },

      { type: "h2", id: "choose-the-memory", text: "1. Choose one memory, not a whole life story" },
      { type: "p", text: "A song has room for a feeling and a handful of images. It does not have room for everything that has ever happened. The strongest personalised songs start from a single moment and let that moment stand for the bigger story around it." },
      { type: "p", text: "If you are torn between several memories, ask yourself which one you would describe first if someone asked, \"What was it like?\" That is usually the one." },
      { type: "ul", items: [
        "An anniversary: the day you met, the proposal, or an ordinary evening that somehow sums the two of you up.",
        "A birthday: a moment that shows who the person is, rather than a list of their achievements.",
        "A trip: one scene — a sunset, a toast, a place you keep talking about.",
        "Remembering someone: a habit, a phrase they always used, the place you picture them.",
      ] },

      { type: "h2", id: "find-the-details", text: "2. Find the details only you would know" },
      { type: "p", text: "The difference between a generic song and a personal one is detail. Not dates and facts so much as the small, specific things that make someone smile when they hear them." },
      { type: "ul", items: [
        "A name, nickname or pet name.",
        "A place: the street, the restaurant, the beach, the name of the ship or the town.",
        "Something that was said, a running joke or a line you still repeat.",
        "A sound, a smell or a song that was playing.",
        "What the weather was doing, what someone was wearing, what you were eating.",
      ] },
      { type: "tip", title: "A simple test", text: "Read your description back and ask: could this be about anyone else? If yes, add one detail that could only be about you." },

      { type: "h2", id: "say-how-it-felt", text: "3. Say how it felt, not just what happened" },
      { type: "p", text: "Songs carry emotion better than information. After you have written what happened, add a sentence about how it felt at the time — and how it feels now, looking back. Proud, giddy, peaceful, a little bittersweet: those words steer the melody and the mood as much as the lyrics." },
      { type: "p", text: "It is fine if the feeling is mixed. A song for a retirement can be joyful and wistful at once. A song remembering someone can be warm rather than sad. Tell us which way you would like it to lean." },

      { type: "h2", id: "keep-it-short", text: "4. Keep it short and clear" },
      { type: "p", text: `When you create a memory with us, each memory has space for up to ${STORY_MAX} characters — roughly two or three sentences. That limit is deliberate. It encourages you to pick the details that matter most, and those are exactly what a songwriter needs.` },
      { type: "p", text: "A helpful shape is: who it is about, the moment itself, one or two details, and how it felt." },
      { type: "tip", title: "An example of the shape", text: "\"For my wife, Anna. The evening we renewed our vows at sunset, when the band played our wedding song and she laughed because I still can't dance. I want it to feel warm and a little bit funny.\"" },

      { type: "h2", id: "choose-a-style", text: "5. Choose a style — or let us choose" },
      { type: "p", text: "Think about the music the person already loves, or the atmosphere of the moment. A beach wedding might suit something acoustic and relaxed; a big family birthday might want something upbeat enough to sing along to. If you are not sure, you can ask us to choose, and we will pick a style that suits the story you have told." },

      { type: "h2", id: "photos", text: "6. Add a photo if it helps" },
      { type: "p", text: `For a record, a photograph can become part of the artwork. ${KEEPSAKE.name} comes with personalised picture-disc artwork, and ${JOURNEY.name} includes personalised album artwork that can include your approved photograph. Choose a clear, well-lit image that you are happy to see printed large.` },

      { type: "h2", id: "what-happens-next", text: "7. What happens after you share it" },
      { type: "ol", items: [
        "We read your story and write lyrics from it.",
        "We record and produce the song in the style you chose.",
        "We send it to you to listen to. If something is not quite right — a line, the pace, the feel of a section — you can ask for a change.",
        "Once you approve it, a digital song is yours to keep and share; a record is then made for you.",
      ] },
      { type: "p", text: `${MOMENT.name} is our digital song, with ${(MOMENT.revisions ?? "").toLowerCase()} included. ${KEEPSAKE.name} and ${JOURNEY.name} are physical records made to order; for those, allow at least ${RECOMMENDED_PLANNING_DAYS} working days, and tell us before you order if you need it for a particular date.` },

      { type: "h2", id: "choosing-a-format", text: "Digital song, picture disc or album?" },
      { type: "ul", items: [
        `${MOMENT.name}: one personalised song, delivered digitally — ideal when you want to share it quickly or play it at an event.`,
        `${KEEPSAKE.name}: your music on a personalised picture disc — something to display as well as play.`,
        `${JOURNEY.name}: a personalised album on standard vinyl, for telling a longer story in chapters.`,
      ] },
      { type: "cta", text: "One memory, delivered digitally?", label: `See ${MOMENT.name}`, to: "/moment" },
      { type: "cta", text: "A whole story told in chapters, on vinyl?", label: `See ${JOURNEY.name}`, to: "/journey" },

      { type: "h2", id: "summary", text: "In short" },
      { type: "p", text: "Pick one moment. Add the details only you would know. Say how it felt. Keep it to a few clear sentences, and choose a style or let us choose. That is everything a songwriter needs to make a song that sounds like your story." },
    ],
  },

  {
    slug: "preserve-cruise-memories-after-you-return-home",
    title: "How to Preserve the Memories of a Cruise Long After You Return Home",
    excerpt:
      "Simple ways to hold on to a voyage once the suitcases are unpacked — from what to note down on board to turning the best moments into music.",
    heroImage: "soloDeck",
    publishedAt: "2026-09-14",
    updatedAt: "2026-09-14",
    author: MCB,
    categories: ["Cruise memories", "Travel"],
    seoTitle: "How to Preserve Your Cruise Memories After You Return Home | My Custom Beats",
    metaDescription:
      "Practical ways to keep a cruise alive after you're home: what to capture on board, how to organise photos and notes, and how to turn the best moments into a keepsake.",
    related: ["turn-a-special-memory-into-a-personalised-song", "picture-disc-keepsakes-music-and-memories-you-can-hold"],
    cta: {
      heading: "Turn your voyage into music",
      text: "Tell us about the moments you want to keep — one song, a record for a day, or an album for the whole trip.",
      label: "Explore cruise memories",
      to: "/cruise",
    },
    content: [
      { type: "p", text: "The last evening of a cruise has a particular feeling: the sea is the same, but everyone is already half thinking about home. A week later the tan has faded, the photos are buried in a phone, and the details — the name of that little bar in port, the joke at dinner — are starting to slip." },
      { type: "p", text: "The good news is that holding on to a voyage takes very little effort if you start while you are still on board. Here are practical ways to do it, whether you are the kind of traveller who keeps a journal or the kind who has never written a postcard." },

      { type: "h2", id: "on-board", text: "While you are still on board" },
      { type: "h3", text: "Write three lines a day" },
      { type: "p", text: "You do not need a diary. At the end of each day, jot down three things in your phone's notes: one thing you saw, one thing someone said, and one thing you felt. It takes a minute, and those three lines will unlock far more than a photo will in a year's time." },
      { type: "h3", text: "Capture sound as well as pictures" },
      { type: "p", text: "Record a few seconds of the things you will miss hearing: the sailaway music, a market in port, the sea from the balcony at night. Short clips are easy to keep and surprisingly powerful to play back." },
      { type: "h3", text: "Keep the small paper things" },
      { type: "ul", items: [
        "The daily programme or the menu from a special dinner.",
        "Tickets, receipts and maps from each port.",
        "A napkin, a postcard or a pressed flower — anything flat that fits in a book.",
      ] },
      { type: "tip", title: "A simple habit", text: "Put everything flat into one envelope each day and write the day and the port on the front. Sorting it later becomes a five-minute job." },

      { type: "h2", id: "first-week-home", text: "In the first week home" },
      { type: "p", text: "Memory fades fastest in the first few weeks, so this is the moment to spend an evening on it — ideally with whoever you travelled with, because each of you will remember different things." },
      { type: "ol", items: [
        "Make a folder for the trip and move your photos and clips into it, one sub-folder per day.",
        "Delete the near-duplicates. Keep the best one or two of each scene.",
        "Next to each day, add your three lines from on board, and anything the others remember.",
        "Choose your favourite moment from the whole trip. Just one. You will use it later.",
      ] },

      { type: "h2", id: "ways-to-keep-it", text: "Ways to keep the voyage alive" },
      { type: "h3", text: "A photo book or a single print" },
      { type: "p", text: "A printed book is lovely, but a single large print of the best photograph, framed where you will see it every day, often does more. It keeps the trip in the room rather than on a shelf." },
      { type: "h3", text: "A shared album for everyone who travelled" },
      { type: "p", text: "If you sailed with family or friends, a shared online album lets everyone add their own photos. You will be surprised how many moments you missed that someone else caught." },
      { type: "h3", text: "A song about the trip" },
      { type: "p", text: "Music is one of the strongest ways to bring back a time and place. A personalised song written from your own memories — the port, the people, the evening you will not forget — turns a holiday into something you can play at an anniversary dinner or send to the people who were there." },
      { type: "ul", items: [
        `One song about one moment: ${MOMENT.name}, delivered digitally.`,
        `A record for a single day or memory: ${KEEPSAKE.name}, on a personalised picture disc (${keepsakeSizes}).`,
        `The whole trip, chapter by chapter: ${JOURNEY.name}, a personalised album on standard vinyl, with a different style for each song if you wish.`,
      ] },
      { type: "cta", text: "Planning something for a trip you are about to take? You can order a separate record for each day of a voyage.", label: "See Keepsake", to: "/keepsake" },
      { type: "cta", text: "Rather tell the whole voyage on one album, a chapter for each part of the trip?", label: `See ${JOURNEY.name}`, to: "/journey" },

      { type: "h2", id: "describe-the-trip", text: "How to describe a trip for a song" },
      { type: "p", text: "When you come to describe the voyage, resist the urge to list every port. Pick the scene that sums it up and give it detail: where you were standing, who was there, what was happening, and how it felt. Your notes from on board are perfect for this." },
      { type: "tip", title: "An example", text: "\"Our first cruise together for our 30th anniversary. Standing at the back of the ship on the last night, watching the wake in the moonlight while the band played inside. It felt like the start of something, not the end.\"" },

      { type: "h2", id: "timing", text: "A note on timing" },
      { type: "p", text: `If you would like a physical record ready for a particular date — an anniversary, a reunion with the people you travelled with — allow at least ${RECOMMENDED_PLANNING_DAYS} working days, and tell us the date before you order so we can say honestly whether it can be met. A digital song is much quicker.` },

      { type: "h2", id: "summary", text: "In short" },
      { type: "p", text: "Write three lines a day on board, keep the small paper things, and spend one evening in the first week home putting it all in order. Then choose one way to keep the trip where you will notice it — a print on the wall, an album shared with everyone who came, or a song that takes you straight back to the deck." },
    ],
  },

  {
    slug: "picture-disc-keepsakes-music-and-memories-you-can-hold",
    title: "Picture Disc Keepsakes: Turning Music and Memories Into Something You Can Hold",
    excerpt:
      "What a picture disc is, why it makes a meaningful keepsake, how to choose the right size and photograph, and how to look after it for years to come.",
    heroImage: "pictureDiscWall",
    publishedAt: "2026-09-14",
    updatedAt: "2026-09-14",
    author: MCB,
    categories: ["Keepsakes", "Vinyl"],
    seoTitle: "Picture Disc Keepsakes: Music and Memories You Can Hold | My Custom Beats",
    metaDescription:
      "A guide to personalised picture discs: what they are, choosing a size and photograph, how they differ from standard vinyl, and how to care for one.",
    related: ["turn-a-special-memory-into-a-personalised-song", "preserve-cruise-memories-after-you-return-home"],
    cta: {
      heading: "Put your memory on a picture disc",
      text: "Choose a size, tell us the story, and we'll create the music and the artwork.",
      label: "Explore Keepsake",
      to: "/keepsake",
    },
    content: [
      { type: "p", text: "A song lives in the air. A photograph lives in a frame. A picture disc brings the two together: a real vinyl record with an image set into the disc itself, so the memory is something you can see, hold and play." },
      { type: "p", text: "This guide explains what a picture disc is, why it makes such a personal keepsake, how to choose a size and a photograph, and how to look after it." },

      { type: "h2", id: "what-is-a-picture-disc", text: "What is a picture disc?" },
      { type: "p", text: "A picture disc is a vinyl record where the artwork is part of the disc rather than printed on a label or a sleeve. The image sits under a clear playing surface, so as the record turns, the picture turns with it. When it is not playing, it can be displayed like a piece of art." },
      { type: "p", text: `With ${KEEPSAKE.name}, your personalised music is pressed onto a picture disc with personalised artwork made for you.` },

      { type: "h2", id: "why-a-keepsake", text: "Why it makes a meaningful keepsake" },
      { type: "ul", items: [
        "It is physical. A gift you can unwrap and hold feels different from a link in a message.",
        "It is on display. A picture disc can stand on a shelf or hang on a wall, so the memory is part of the room.",
        "It is personal twice over: the music is written from your story, and the artwork carries your chosen image.",
        "It invites a moment. Taking a record out and putting it on is a small ceremony — a good way to mark an anniversary or a reunion.",
      ] },

      { type: "h2", id: "choosing-a-size", text: "Choosing a size" },
      { type: "p", text: `${KEEPSAKE.name} comes as ${keepsakeSizes}. The larger discs hold more songs; the smaller ones are perfect for a single memory.` },
      { type: "ul", items: KEEPSAKE.variants.map((v) => `${v.label}: ${v.songCount === 1 ? "1 personalised song" : `${v.songCount} personalised songs`}.`) },
      { type: "tip", title: "One memory or several?", text: "You do not have to fit everything onto one record. Some people choose a separate Keepsake for each memory — or for each day of a trip — so every one has its own artwork." },

      { type: "h2", id: "occasions", text: "Occasions that suit a picture disc" },
      { type: "p", text: "Because a picture disc is made to be seen, it suits moments people want to keep in view rather than tuck away." },
      { type: "ul", items: [
        "Anniversaries: the song about how you met, with a photograph from the day, on the shelf where you will see it.",
        "Weddings: a first-dance memory for the couple, or a gift for parents who made the day possible.",
        "Milestone birthdays: a song about the person, with a favourite photo from any age.",
        "Travel: a record for one unforgettable day of a trip, with the view you still talk about.",
        "Remembering someone: a gentle, lasting way to keep a voice, a place or a story close.",
      ] },
      { type: "p", text: "It also makes a thoughtful gift for someone who already has everything. It cannot be bought off a shelf, because it did not exist until you told us the story." },

      { type: "h2", id: "what-to-tell-us", text: "What to tell us for the music" },
      { type: "p", text: "The artwork is the part people notice first, but the song is the heart of it. For each song on the disc, share one memory in a few clear sentences: who it is about, the moment itself, one or two details only you would know, and how it felt. Then choose a music style, or ask us to choose one for you." },
      { type: "p", text: "If your disc holds more than one song, each song can tell a different memory. A 12-inch Keepsake could hold four chapters of the same story — the day you met, the wedding, the move, the grandchildren — or four quite different moments that belong together." },

      { type: "h2", id: "choosing-a-photo", text: "Choosing the photograph" },
      { type: "p", text: "The image is the first thing anyone sees, so it is worth a few minutes' thought." },
      { type: "ul", items: [
        "Pick a photo that is sharp and well lit. A slightly blurry phone picture will look softer when it is printed large.",
        "Simple compositions work best. One or two faces, or a single scene, read better on a round disc than a busy group shot.",
        "Think about the centre. The middle of a record is where the spindle hole goes, so avoid a photo where the most important detail is dead centre.",
        "Use a photo you have the right to use — ideally one you or your family took.",
      ] },

      { type: "h2", id: "picture-disc-or-standard-vinyl", text: "Picture disc or standard vinyl?" },
      { type: "p", text: `Picture discs are chosen as much for how they look as for how they sound, which is what makes them such a natural keepsake. If what you want is an album to listen to from start to finish, ${JOURNEY.name} is a personalised album on classic black vinyl with personalised sleeve artwork — ${JOURNEY.name} is not a picture disc.` },
      { type: "cta", text: "Telling a longer story, with a song for every chapter?", label: "See Journey", to: "/journey" },

      { type: "h2", id: "caring-for-it", text: "Looking after a picture disc" },
      { type: "p", text: "A picture disc is still a vinyl record, and the usual care applies." },
      { type: "ol", items: [
        "Hold it by the edges so fingerprints stay off the playing surface and the image.",
        "Keep it out of direct sunlight and away from radiators, car dashboards and other heat, which can warp vinyl.",
        "Store it upright in its sleeve when it is not on display, rather than lying flat under other things.",
        "If you display it, choose a spot out of strong sun and where it will not be knocked.",
        "Dust it gently with a soft, dry anti-static cloth before playing.",
      ] },
      { type: "p", text: "If your record arrives damaged or faulty, tell us as soon as you can and we will help. Your normal consumer rights are not affected." },

      { type: "h2", id: "planning", text: "Planning ahead" },
      { type: "p", text: `Each Keepsake is made to order: the music is written and produced, you approve it, and then the record is made. Allow at least ${RECOMMENDED_PLANNING_DAYS} working days, and if you need it for a specific date, tell us before you order.` },

      { type: "h2", id: "summary", text: "In short" },
      { type: "p", text: "A picture disc turns a personalised song into an object: a record you can play, with your memory set into the disc. Choose a size for the number of songs you want, pick a clear and simple photograph, keep it out of heat and sunlight — and it will keep the moment in the room for years." },
    ],
  },
];

export const getBlogPost = (slug: string): BlogPost | undefined => BLOG_POSTS.find((post) => post.slug === slug);
