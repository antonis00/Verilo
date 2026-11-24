import type { Metadata } from "next";
import Link from "next/link";
import { contactEmail, governingLaw, operatorName, SITE_NAME } from "@/lib/site";

export const metadata: Metadata = {
  title: "Terms of use",
  description: `The terms for using ${SITE_NAME}.`,
};

// The terms of use. Like the privacy policy, it must match what the app does: update it before
// launching payments or anything else it mentions. To be reviewed by a lawyer before launch.
const UPDATED = "24 November 2026";

const LATER = "will be published on this page before launch";

function Contact() {
  const email = contactEmail();
  return email ? (
    <a href={`mailto:${email}`}>{email}</a>
  ) : (
    <span>the contact address that {LATER}</span>
  );
}

export default function TermsPage() {
  const operator = operatorName();
  const law = governingLaw();
  return (
    <article className="mx-auto max-w-prose py-6 md:py-10">
      <p className="kicker">The rules</p>
      <h1 className="mt-2 text-3xl md:text-4xl">Terms of use</h1>
      <p className="meta mt-3">Last updated {UPDATED}</p>

      <div className="mt-8 space-y-8">
        <section aria-labelledby="t-agree">
          <h2 id="t-agree" className="text-xl">
            1. These terms
          </h2>
          <p className="mt-3">
            These terms are an agreement between you and{" "}
            {operator ?? `the operator of ${SITE_NAME}`} (&ldquo;{SITE_NAME}&rdquo;,
            &ldquo;we&rdquo;, &ldquo;us&rdquo;){operator ? "" : `, whose legal name ${LATER}`}. By
            creating an account or using {SITE_NAME}, you accept them. Our{" "}
            <Link href="/privacy">privacy policy</Link> explains how we handle your data. If you
            don&rsquo;t agree, please don&rsquo;t use {SITE_NAME}.
          </p>
        </section>

        <section aria-labelledby="t-service">
          <h2 id="t-service" className="text-xl">
            2. What {SITE_NAME} is
          </h2>
          <p className="mt-3">
            {SITE_NAME} gathers news that other outlets publish, groups reports about the same event
            into stories, and shows their headlines, short excerpts and links. For some stories it
            shows a short summary written by an AI model from those headlines and excerpts and
            checked before it is shown. We don&rsquo;t write the news: the outlets do, and the full
            articles are on their own sites.
          </p>
        </section>

        <section aria-labelledby="t-accuracy">
          <h2 id="t-accuracy" className="text-xl">
            3. Accuracy, and what {SITE_NAME} is not
          </h2>
          <ul className="mt-3 list-disc space-y-2 pl-5">
            <li>
              News changes and outlets make mistakes. Summaries are checked against the reports they
              cite, but AI can still be wrong, and the reports themselves can be wrong or out of
              date. Read the original reports before relying on anything you read here.
            </li>
            <li>
              {SITE_NAME} is for general information. It is not financial, legal, medical, safety or
              any other professional advice, and nothing here is a recommendation to act.
            </li>
            <li>
              The tier and lean we give each outlet are our own editorial judgement, explained on
              the site, not statements of fact about any outlet.
            </li>
            <li>
              Showing an outlet&rsquo;s report doesn&rsquo;t mean we agree with it or vouch for it.
            </li>
            <li>
              Sources you add yourself (feeds, websites, Telegram channels) are your choice. We
              don&rsquo;t check, rate or endorse them, and we keep them out of our summaries. We say
              an item comes from an outlet only when we have confirmed it; anything else is marked
              unverified. You read them at your own risk.
            </li>
          </ul>
          <p className="mt-3">
            If you find a mistake, use &ldquo;Report a mistake&rdquo; on the story; we publish our
            corrections at <Link href="/corrections">Corrections</Link>.
          </p>
        </section>

        <section aria-labelledby="t-account">
          <h2 id="t-account" className="text-xl">
            4. Your account
          </h2>
          <ul className="mt-3 list-disc space-y-2 pl-5">
            <li>You must be at least 16 to use {SITE_NAME}.</li>
            <li>
              An account is for one person. We sign you in by emailing a link, so keep your email
              account secure; anyone with access to it can sign in as you.
            </li>
            <li>You can delete your account at any time in Preferences.</li>
          </ul>
        </section>

        <section aria-labelledby="t-trial">
          <h2 id="t-trial" className="text-xl">
            5. The free trial and paying
          </h2>
          <p className="mt-3">
            New accounts get a free trial of 14 days with everything included. We don&rsquo;t take
            payments yet, so nothing is charged. Before we offer paid plans, we will publish their
            prices and terms, and you will be charged only if you choose a plan yourself.
          </p>
        </section>

        <section aria-labelledby="t-use">
          <h2 id="t-use" className="text-xl">
            6. Using {SITE_NAME} fairly
          </h2>
          <p className="mt-3">You agree not to:</p>
          <ul className="mt-3 list-disc space-y-2 pl-5">
            <li>
              copy, scrape or download {SITE_NAME}&rsquo;s content in bulk, or with automated tools,
              or republish it, including our summaries, for any commercial purpose;
            </li>
            <li>
              get around the limits we set (on sign-in emails or reports, for example), probe or
              test our security, or interfere with how {SITE_NAME} works for others;
            </li>
            <li>request sign-in emails for addresses that aren&rsquo;t yours;</li>
            <li>send false, abusive or unlawful reports through &ldquo;Report a mistake&rdquo;;</li>
            <li>
              add as your own source anything unlawful where you or we are, or anything you use to
              make {SITE_NAME} fetch what it shouldn&rsquo;t; we may block a source, or remove it,
              without notice;
            </li>
            <li>use {SITE_NAME} for anything unlawful.</li>
          </ul>
        </section>

        <section aria-labelledby="t-ip">
          <h2 id="t-ip" className="text-xl">
            7. Whose content is whose
          </h2>
          <p className="mt-3">
            Headlines, excerpts and articles belong to the outlets that published them; their links
            take you to their sites, which have their own terms. {SITE_NAME}&rsquo;s design,
            software, summaries and ratings belong to us. We give you a personal, non-commercial
            licence to read and share links to {SITE_NAME}; you may quote a summary briefly with a
            link to its story. Outlets who would like their content handled differently can contact
            us at <Contact />.
          </p>
        </section>

        <section aria-labelledby="t-changes">
          <h2 id="t-changes" className="text-xl">
            8. Changes, availability and ending
          </h2>
          <p className="mt-3">
            We may change, add or remove features, and {SITE_NAME} may sometimes be unavailable. We
            may suspend or close an account that breaks these terms, telling you why unless the law
            or the safety of others prevents it. You may stop using {SITE_NAME} and delete your
            account at any time.
          </p>
        </section>

        <section aria-labelledby="t-liability">
          <h2 id="t-liability" className="text-xl">
            9. Our responsibility to you
          </h2>
          <p className="mt-3">
            We provide {SITE_NAME} with care, but &ldquo;as is&rdquo; and &ldquo;as
            available&rdquo;: as far as the law allows, we don&rsquo;t promise it will be accurate,
            complete, uninterrupted or free of errors, or fit for any particular purpose.
          </p>
          <p className="mt-3">
            As far as the law allows, we are not liable for loss of profits, data or opportunity, or
            for any indirect or consequential loss, and in particular not for decisions made on the
            strength of news, summaries or ratings shown on {SITE_NAME}. Our total liability to you
            for anything arising from {SITE_NAME} is limited to the amount you paid us in the twelve
            months before the claim, or USD 50 if you paid nothing.
          </p>
          <p className="mt-3">
            Nothing in these terms limits liability that the law doesn&rsquo;t allow to be limited,
            such as for fraud, or for death or personal injury caused by negligence, or takes away
            rights you have as a consumer under the law where you live.
          </p>
        </section>

        <section aria-labelledby="t-law">
          <h2 id="t-law" className="text-xl">
            10. Disputes
          </h2>
          <p className="mt-3">
            If something goes wrong, please contact us first at <Contact />; most problems can be
            solved that way. These terms are governed by {law ?? `the law that ${LATER}`}, and its
            courts handle disputes about them, without taking away the protection of the law and
            courts where you live if you are a consumer and that law gives you that right.
          </p>
        </section>

        <section aria-labelledby="t-general">
          <h2 id="t-general" className="text-xl">
            11. The rest
          </h2>
          <p className="mt-3">
            If part of these terms can&rsquo;t be enforced, the rest still applies. If we
            don&rsquo;t enforce a term straight away, we can still enforce it later. We may update
            these terms; if a change matters, we will tell you before it applies, and you can delete
            your account if you don&rsquo;t accept it. These terms, with the privacy policy, are the
            whole agreement between us about {SITE_NAME}.
          </p>
        </section>
      </div>
    </article>
  );
}
