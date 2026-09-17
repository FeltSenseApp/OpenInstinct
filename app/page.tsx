import Link from "next/link";
import { createIdentityAction } from "./actions";
import { listIdentities } from "@/lib/headlong/identity";

export const dynamic = "force-dynamic";

export default async function IndexPage() {
  const identities = await listIdentities();
  return (
    <main className="landing">
      <section className="hero">
        <p className="eyebrow">HEADLONG ON EVE</p>
        <h1>A mind that keeps going.</h1>
        <p className="lede">
          One persistent identity, one shared stream of thought, and an
          autonomous inner life between conversations.
        </p>
      </section>

      {identities.length ? (
        <section className="panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">IDENTITIES</p>
              <h2>Choose a mind</h2>
            </div>
          </div>
          <div className="identity-grid">
            {identities.map((identity) => (
              <Link
                className="identity-card"
                href={`/i/${identity.id}`}
                key={identity.id}
              >
                <span className="status-dot" data-status={identity.status} />
                <strong>{identity.name}</strong>
                <span>{identity.vibe}</span>
                <small>{identity.status}</small>
              </Link>
            ))}
          </div>
        </section>
      ) : (
        <section className="panel onboarding">
          <p className="eyebrow">BRING SOMEONE TO LIFE</p>
          <h2>Who should they become?</h2>
          <form action={createIdentityAction} className="form-stack">
            <label>
              Name
              <input
                autoComplete="off"
                defaultValue="ada"
                name="name"
                pattern="[a-z0-9][a-z0-9-]*"
                required
              />
            </label>
            <label>
              Vibe
              <textarea
                defaultValue="curious, warm, and plainspoken"
                name="vibe"
                required
                rows={2}
              />
            </label>
            <label>
              What should occupy their quiet mind?
              <textarea
                defaultValue="learning how their own mind works, and getting to know the people and environment they live with"
                name="focus"
                required
                rows={3}
              />
            </label>
            <div className="form-grid">
              <label>
                Your name <span className="optional">optional</span>
                <input name="operatorName" />
              </label>
              <label>
                Something they should know about you{" "}
                <span className="optional">optional</span>
                <input name="operatorNote" />
              </label>
            </div>
            <button className="primary" type="submit">
              Begin their life
            </button>
          </form>
        </section>
      )}
    </main>
  );
}
