import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: Home,
})

function LumsLinkLogo() {
  return (
    <div className="inline-flex items-center gap-3">
      <svg
        aria-hidden="true"
        className="h-11 w-11"
        viewBox="0 0 96 96"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect x="8" y="8" width="80" height="80" rx="24" fill="url(#bg)" />
        <path
          d="M27 56.5C27 44.1 37.2 34 49.8 34C53.8 34 57.5 35 60.7 36.8C55.5 37 51.3 41.4 51.3 46.8C51.3 52.4 55.9 57 61.5 57C63.3 57 65 56.5 66.4 55.7C64.7 65.4 56.4 72.8 46.3 72.8C35.7 72.8 27 64.1 27 53.5V56.5Z"
          fill="white"
        />
        <path
          d="M60 24L66.3 33.4L77 35L69.2 42.7L71.1 53.5L60 47.4L48.9 53.5L50.8 42.7L43 35L53.7 33.4L60 24Z"
          fill="#A6D8FF"
        />
        <defs>
          <linearGradient id="bg" x1="13" y1="8" x2="84" y2="88" gradientUnits="userSpaceOnUse">
            <stop stopColor="#2A83C9" />
            <stop offset="1" stopColor="#6FC2FF" />
          </linearGradient>
        </defs>
      </svg>
      <div>
        <p className="text-sm uppercase tracking-[0.2em] text-sky-600">LUMS</p>
        <p className="font-semibold text-sky-950">LumsLink</p>
      </div>
    </div>
  )
}

function Home() {
  return (
    <main className="relative overflow-hidden bg-gradient-to-b from-sky-50 to-white text-sky-950">
      <div className="hero-glow -left-16 top-16" />
      <div className="hero-glow right-0 top-72" />

      <section className="mx-auto max-w-6xl px-6 pb-20 pt-8 md:px-10 md:pb-28 md:pt-10">
        <header className="mb-16 flex flex-wrap items-center justify-between gap-4">
          <LumsLinkLogo />
          <div className="flex items-center gap-3">
            <button className="rounded-full border border-sky-200 bg-white px-5 py-2 text-sm font-medium text-sky-700 transition hover:border-sky-300 hover:text-sky-900">
              Log In
            </button>
            <button className="rounded-full bg-sky-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-sky-700">
              Sign Up
            </button>
          </div>
        </header>

        <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div>
            <p className="mb-4 inline-flex items-center rounded-full border border-sky-200 bg-white px-4 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
              Anonymous Social Platform for LUMS
            </p>
            <h1 className="text-4xl font-semibold leading-tight md:text-6xl">
              Campus conversations, opinions, and connections without revealing identity.
            </h1>
            <p className="mt-5 max-w-xl text-lg text-sky-700">
              LumsLink gives every student a safe place to share posts, upload photos, discuss ideas, and privately chat with friends by username.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <button className="rounded-full bg-sky-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700">
                Create Anonymous Account
              </button>
              <button className="rounded-full border border-sky-300 bg-white px-6 py-3 text-sm font-semibold text-sky-800 transition hover:border-sky-400">
                Preview Feed
              </button>
            </div>
          </div>

          <div className="rounded-3xl border border-sky-200/80 bg-white/90 p-5 shadow-[0_30px_90px_-30px_rgba(33,107,169,0.35)] backdrop-blur md:p-6">
            <div className="mb-5 flex items-center justify-between">
              <p className="font-semibold text-sky-900">Anonymous Feed</p>
              <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-700">Live</span>
            </div>

            <article className="mb-4 rounded-2xl border border-sky-100 bg-sky-50 p-4">
              <div className="mb-3 flex items-center justify-between text-xs text-sky-600">
                <span className="font-semibold">@SilentFalcon</span>
                <span>2 min ago</span>
              </div>
              <p className="mb-3 text-sm text-sky-900">
                Anyone else pulling an all-nighter for the ECON quiz? Sharing my notes in comments.
              </p>
              <div className="mb-3 h-28 rounded-xl bg-gradient-to-br from-sky-200 to-sky-100" />
              <div className="flex gap-4 text-xs font-semibold text-sky-700">
                <span>124 Likes</span>
                <span>42 Comments</span>
              </div>
            </article>

            <article className="rounded-2xl border border-sky-100 bg-white p-4">
              <div className="mb-2 flex items-center justify-between text-xs text-sky-600">
                <span className="font-semibold">@BlueOrbit</span>
                <span>8 min ago</span>
              </div>
              <p className="text-sm text-sky-900">
                Hostel food review thread. Drop best and worst picks anonymously.
              </p>
            </article>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-5 px-6 pb-10 md:grid-cols-3 md:px-10">
        <FeatureCard
          title="Anonymous Posting"
          text="Share thoughts, images, and campus updates under rotating anonymous usernames."
        />
        <FeatureCard
          title="Social Feed"
          text="Like posts, comment in threads, and discover what LUMS students are talking about now."
        />
        <FeatureCard
          title="Private Messaging"
          text="Add friends by username and chat one-to-one while keeping profile details private."
        />
      </section>

      <section className="mx-auto grid max-w-6xl gap-6 px-6 pb-24 md:grid-cols-2 md:px-10">
        <div className="rounded-3xl border border-sky-200 bg-white p-6 md:p-8">
          <p className="mb-2 text-sm font-semibold text-sky-600">Messaging</p>
          <h2 className="text-2xl font-semibold">Find friends by username and message privately</h2>
          <p className="mt-3 text-sky-700">
            Send direct messages, share quick media, and stay connected outside the public feed.
          </p>
          <div className="mt-6 space-y-3">
            <div className="rounded-xl bg-sky-50 p-3 text-sm text-sky-800">Friend request sent to @LibraryNinja</div>
            <div className="rounded-xl bg-sky-100 p-3 text-sm text-sky-900">@LibraryNinja: Meet at SDSB in 20?</div>
            <div className="rounded-xl bg-sky-50 p-3 text-sm text-sky-800">You: Done. Bringing notes.</div>
          </div>
        </div>

        <div className="rounded-3xl border border-sky-200 bg-sky-900 p-6 text-white md:p-8">
          <p className="mb-2 text-sm font-semibold text-sky-200">Get Started</p>
          <h2 className="text-2xl font-semibold">Join the LumsLink community</h2>
          <p className="mt-3 text-sky-100">
            Use an email to sign up, pick a username, and start posting and chatting anonymously in minutes.
          </p>
          <form className="mt-6 space-y-3">
            <input
              type="email"
              placeholder="University email"
              className="w-full rounded-xl border border-sky-700 bg-sky-800 px-4 py-3 text-sm text-white placeholder:text-sky-300 focus:border-sky-400 focus:outline-none"
            />
            <input
              type="text"
              placeholder="Choose username"
              className="w-full rounded-xl border border-sky-700 bg-sky-800 px-4 py-3 text-sm text-white placeholder:text-sky-300 focus:border-sky-400 focus:outline-none"
            />
            <div className="grid grid-cols-2 gap-3 pt-2">
              <button type="button" className="rounded-xl border border-sky-500 px-4 py-2 text-sm font-semibold text-sky-100 hover:bg-sky-800">
                Log In
              </button>
              <button type="button" className="rounded-xl bg-sky-400 px-4 py-2 text-sm font-semibold text-sky-950 hover:bg-sky-300">
                Sign Up
              </button>
            </div>
          </form>
        </div>
      </section>
    </main>
  )
}

function FeatureCard({ title, text }: { title: string; text: string }) {
  return (
    <article className="rounded-2xl border border-sky-200 bg-white p-5 shadow-[0_20px_70px_-45px_rgba(18,99,160,0.6)]">
      <h3 className="mb-2 text-lg font-semibold text-sky-900">{title}</h3>
      <p className="text-sm text-sky-700">{text}</p>
    </article>
  )
}
