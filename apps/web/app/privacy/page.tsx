import type { Metadata } from "next";
import Link from "next/link";
import { contactEmail, SITE_NAME } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy policy",
  description: `What ${SITE_NAME} keeps about you, why, for how long, and how to see or delete it.`,
};

// The privacy policy. It must describe what the app really does: when a feature changes what is
// collected or who receives it (payments, analytics, a new provider), update this page first.
const UPDATED = "24 November 2026";

function Contact() {
  const email = contactEmail();
  return email ? (
    <a href={`mailto:${email}`}>{email}</a>
  ) : (
    <span>the contact address that will be published on this page before launch</span>
  );
}

export default function PrivacyPage() {
  return (
    <article className="mx-auto max-w-prose py-6 md:py-10">
      <p className="kicker">Your privacy</p>
      <h1 className="mt-2 text-3xl md:text-4xl">Privacy policy</h1>
      <p className="meta mt-3">Last updated {UPDATED}</p>

      <div className="legal mt-8 space-y-8">
        <section aria-labelledby="p-short">
          <h2 id="p-short" className="text-xl">
            In short
          </h2>
          <ul className="mt-3 list-disc space-y-2 pl-5">
            <li>
              We keep only what we need to run {SITE_NAME} for you: your email address, the choices
              you make, and a short record of the emails we send you.
            </li>
            <li>
              We don&rsquo;t sell your data, share it for advertising, show ads, or use tracking or
              analytics tools that follow you around the web.
            </li>
            <li>
              The daily briefing email is off unless you turn it on, and you can stop it in one
              click.
            </li>
            <li>
              You can download everything we keep about you, and delete your account, at any time
              from <Link href="/my-news">Settings</Link>.
            </li>
          </ul>
        </section>

        <section aria-labelledby="p-who">
          <h2 id="p-who" className="text-xl">
            Who we are
          </h2>
          <p className="mt-3">
            {SITE_NAME} (&ldquo;we&rdquo;, &ldquo;us&rdquo;) is a news service that groups reports
            from many outlets into stories. We decide how and why your personal data is used, so we
            are its controller. You can reach us about anything on this page at <Contact />.
          </p>
        </section>

        <section aria-labelledby="p-what">
          <h2 id="p-what" className="text-xl">
            What we collect, and why
          </h2>
          <dl className="mt-3 space-y-4">
            <div>
              <dt className="font-semibold">Your email address</dt>
              <dd className="mt-1 text-ink-muted">
                To create your account and sign you in (we email you a link; there is no password),
                and to send the daily briefing if you ask for it.
              </dd>
            </div>
            <div>
              <dt className="font-semibold">Your choices</dt>
              <dd className="mt-1 text-ink-muted">
                The topics you follow or mute, the regions you care about, the outlets you follow or
                hide, what your front page shows, your sections menu, the stories you save, and your
                briefing settings (whether it is on, the time, its length, your time zone, and when
                you turned it on). We use them only to build your front page and briefing. Some of
                these choices, such as the outlets you follow, could hint at your views; we never
                use them for anything else, never sell them, and never share them for advertising.
              </dd>
            </div>
            <div>
              <dt className="font-semibold">A record of the briefings we send you</dt>
              <dd className="mt-1 text-ink-muted">
                The date of each briefing and which stories were in it, so a briefing is never sent
                twice and we can fix delivery problems. We delete each record after 90 days.
              </dd>
            </div>
            <div>
              <dt className="font-semibold">Reports of mistakes</dt>
              <dd className="mt-1 text-ink-muted">
                If you use &ldquo;Report a mistake&rdquo;, we keep what you wrote, and, if you were
                signed in, a link to your account. Please don&rsquo;t include personal details in a
                report.
              </dd>
            </div>
            <div>
              <dt className="font-semibold">Account and security information</dt>
              <dd className="mt-1 text-ink-muted">
                When your account was created and when you signed in, and, in the records of our
                sign-in provider, the network address and browser used to sign in. We use these to
                keep accounts secure and to stop abuse, such as someone requesting sign-in emails
                for addresses that aren&rsquo;t theirs. To limit abuse we also briefly count
                requests by network address; those counts are kept in memory only and never stored.
              </dd>
            </div>
            <div>
              <dt className="font-semibold">Your free trial</dt>
              <dd className="mt-1 text-ink-muted">
                When your trial ends, and later whether you subscribe. We don&rsquo;t take payments
                yet. When we do, this page will say which payment provider handles your payment
                details; we will not store card numbers ourselves.
              </dd>
            </div>
          </dl>
          <p className="mt-4">
            We don&rsquo;t collect what you read on other sites, your location beyond the time zone
            your browser reports, your contacts, or anything about you from data brokers.
          </p>
        </section>

        <section aria-labelledby="p-cookies">
          <h2 id="p-cookies" className="text-xl">
            Cookies and storage in your browser
          </h2>
          <p className="mt-3">
            We use only what the site needs to work: a cookie that keeps you signed in, and a
            setting in your browser that remembers whether you chose the light or dark theme. No
            advertising or tracking cookies, and no analytics. Because these are strictly necessary,
            we don&rsquo;t ask for consent to them; if that ever changes, we will ask first.
          </p>
        </section>

        <section aria-labelledby="p-basis">
          <h2 id="p-basis" className="text-xl">
            Our reasons for using your data
          </h2>
          <ul className="mt-3 list-disc space-y-2 pl-5">
            <li>
              <span className="font-semibold">To provide the service you asked for</span> (your
              account, sign-in, your front page and settings).
            </li>
            <li>
              <span className="font-semibold">Your consent</span>, for the daily briefing email. You
              can withdraw it at any time, in Settings or from any briefing.
            </li>
            <li>
              <span className="font-semibold">Our legitimate interests</span> in keeping the service
              secure, preventing abuse, and fixing errors, always weighed against your privacy.
            </li>
            <li>
              <span className="font-semibold">Legal obligations</span>, where the law requires us to
              keep or disclose information.
            </li>
          </ul>
        </section>

        <section aria-labelledby="p-personalised">
          <h2 id="p-personalised" className="text-xl">
            How your front page is personalised
          </h2>
          <p className="mt-3">
            Your front page and briefing are ordered by rules that use the choices you made (for
            example, stories on topics you follow rank higher). This shapes what you see first; it
            never makes decisions about you with legal or similarly significant effects. The rules
            are explained on <Link href="/about">How Verilo works</Link>, and every story says why
            it is on your page.
          </p>
        </section>

        <section aria-labelledby="p-ai">
          <h2 id="p-ai" className="text-xl">
            AI and your data
          </h2>
          <p className="mt-3">
            Our summaries and topic labels are written by AI models from the headlines and opening
            lines that news outlets publish. These models receive public news text only: never your
            email address, your choices, your reports or anything else about you. Summaries are
            shared by every reader of a story, not written for you.
          </p>
        </section>

        <section aria-labelledby="p-share">
          <h2 id="p-share" className="text-xl">
            Who we share it with
          </h2>
          <p className="mt-3">
            We don&rsquo;t sell or rent personal data, and we don&rsquo;t share it with advertisers
            or data brokers. We use a few service providers who process data only on our
            instructions and under contract, to:
          </p>
          <ul className="mt-3 list-disc space-y-2 pl-5">
            <li>host our database and handle sign-in;</li>
            <li>host the website;</li>
            <li>send emails (sign-in links and briefings), which means they see your address;</li>
            <li>later, take payments.</li>
          </ul>
          <p className="mt-3">
            A current list of these providers is available on request. We may also disclose
            information if the law requires it, to protect the rights, safety or property of our
            readers or of {SITE_NAME}, or as part of a merger or sale of the service, in which case
            this policy continues to apply to your data or you will be told before it changes.
          </p>
        </section>

        <section aria-labelledby="p-transfers">
          <h2 id="p-transfers" className="text-xl">
            Where your data is kept
          </h2>
          <p className="mt-3">
            Our providers may store or process data in countries other than yours. Where the law
            requires it, we use recognised safeguards, such as standard contractual clauses, so your
            data stays protected to the same standard.
          </p>
        </section>

        <section aria-labelledby="p-keep">
          <h2 id="p-keep" className="text-xl">
            How long we keep it
          </h2>
          <ul className="mt-3 list-disc space-y-2 pl-5">
            <li>Your account and choices: until you delete your account.</li>
            <li>The record of briefings sent: 90 days.</li>
            <li>
              Reports of mistakes: as long as useful for keeping our corrections record; the link to
              your account is removed when you delete it.
            </li>
            <li>
              Sign-in and security records: as long as our sign-in provider keeps them, and no
              longer than needed for security.
            </li>
          </ul>
          <p className="mt-3">
            When you delete your account, your data is removed from our live systems at once. Copies
            in backups, if any, are overwritten as those backups expire, within 30 days.
          </p>
        </section>

        <section aria-labelledby="p-rights">
          <h2 id="p-rights" className="text-xl">
            Your rights
          </h2>
          <p className="mt-3">Wherever you live, you can ask us to:</p>
          <ul className="mt-3 list-disc space-y-2 pl-5">
            <li>
              give you a copy of your data (you can also download it yourself in{" "}
              <Link href="/my-news">Settings</Link>);
            </li>
            <li>correct it;</li>
            <li>delete it (you can delete your account yourself in Settings);</li>
            <li>stop or limit a particular use of it, or object to it;</li>
            <li>stop the briefing email (one click in any briefing, or in Settings).</li>
          </ul>
          <p className="mt-3">
            Write to <Contact />. We will answer within one month, and we may ask you to confirm the
            request comes from your account&rsquo;s email address. We won&rsquo;t treat you
            differently for using these rights. You may also complain to the data protection
            authority where you live or work; we would appreciate the chance to put things right
            first.
          </p>
        </section>

        <section aria-labelledby="p-security">
          <h2 id="p-security" className="text-xl">
            Keeping it safe
          </h2>
          <p className="mt-3">
            We protect your data with encrypted connections, access rules in our database that let
            each reader see only their own data, sign-in without passwords, and limits on repeated
            requests. No service can promise perfect security; if a breach affecting your data
            happens, we will tell you and the authorities as the law requires.
          </p>
        </section>

        <section aria-labelledby="p-children">
          <h2 id="p-children" className="text-xl">
            Children
          </h2>
          <p className="mt-3">
            {SITE_NAME} is not meant for anyone under 16, and we don&rsquo;t knowingly collect their
            data. If you think a child has given us their data, contact us and we will delete it.
          </p>
        </section>

        <section aria-labelledby="p-links">
          <h2 id="p-links" className="text-xl">
            Other sites
          </h2>
          <p className="mt-3">
            Stories link to the outlets&rsquo; own articles. Those sites have their own privacy
            policies, which this one doesn&rsquo;t cover.
          </p>
        </section>

        <section aria-labelledby="p-changes">
          <h2 id="p-changes" className="text-xl">
            Changes to this policy
          </h2>
          <p className="mt-3">
            When we change this policy, we update the date at the top. If a change matters, for
            example a new kind of data or a new use of it, we will tell you by email or on the site
            before it applies, and ask for your consent where the law requires it.
          </p>
        </section>
      </div>
    </article>
  );
}
