import { useEffect, useState } from 'react';
import { api, readSaved } from './permanent/api';
import { AdConsentSettings } from './components/AdConsent';
import LocaleControl from './LocaleControl';
import { translate, useLocale } from './locale';
import './policies.css';

export const RULES_VERSION = '2026-10-06';
export const RULES_SUMMARY =
  'Keep this community welcoming: no sexual content, sexualized nudity, exploitation, harassment, hate, threats, graphic violence, slurs, profanity, malicious content or private identifying information. Share only artwork you have permission to use.';
const pages: Record<string, { title: string; paragraphs: string[] }> = {
  '/community': {
    title: 'Community Rules',
    paragraphs: [
      RULES_SUMMARY,
      'These rules apply to drawings, uploaded images and GIFs, avatars, stickers, names, descriptions, artwork text and chat. Pornography, sexual solicitation, sexual harassment and any sexual content involving minors are prohibited. Do not target people with abuse, share private identifying information, make credible threats or encourage violence.',
      'Server text filters block some English and Arabic prohibited words and common evasions. They can miss content or make mistakes. New image and GIF uploads are held back from public use until a moderator reviews them; approved uploads can still contain content the reviewer misses. Existing artwork, images and canvas strokes are not automatically scanned for sexual or violent content. File validation checks format and size, not meaning. Reports need human review; response times are not guaranteed. Do not assume all visible content is suitable for children.',
      'Use Safety & privacy to report an artwork, media file, chat message or profile by its ID. Reports are stored for review. Three distinct open reports temporarily hide eligible artwork, approved media and chat while a moderator reviews them; dismissing a report can release that hold when fewer than three remain. Moderators can hide artwork, media and chat and dismiss reports, with an audit record. Profile and complex cases require operator review. You can view the status of your own reports.',
    ],
  },
  '/privacy': {
    title: 'Privacy Policy',
    paragraphs: [
      'The permanent canvas stores a random artist ID, chosen public name and color, optional uploaded avatar, hashed recovery secret, creation/last visit timestamps, and activity counters used for streaks and rewards. Your recovery secret is stored on your device; anyone with it can act as you. Do not put your real name, contact details or other private information in public content.',
      'Published artwork, creator attribution, approved uploads, reactions and chat are public. New media uploads remain private from ordinary visitors until a moderator approves them. Reviewers configured by the operator can inspect pending uploads. Live presence shares your artist name, color, viewport/cursor and drawing status with connected visitors. Server infrastructure receives IP addresses and request information for delivery, security and rate limits. We do not intentionally request birth dates, addresses, telephone numbers or marketing email.',
      'Drafts, pending publications, identity credentials, preferences, demo balances and local Classic content use browser storage. Draft mode does not publish saved drafts automatically. Queued publications are different from drafts and retry after connectivity returns. Clearing browser data can lose access and unpublished work; save your recovery secret securely.',
      'Classic remote sessions use an essential session cookie and may use a configured OpenID Connect provider. The configured hosting, database and object storage providers process data needed to run the service. No third-party AI image moderation transmission is implemented. Advertising remains disabled unless the operator configures a publisher account and ad units. If enabled, Google ad technology may process device and ad-request data; optional ad scripts load only after an affirmative device choice and a successful consent check.',
      'Removing permanent artwork hides it from active views and releases its unused cells. Original artwork and attribution remain in server history; owner removals can be restored for 30 days if space is available. History, media, reports and security audit records currently have no automatic purge schedule. Backups may retain earlier records. Removal is not immediate erasure of all copies.',
      'Request deletion of your own identity data in Safety & privacy. Authentication verifies ownership. A request receives a stored reference and pending status; it does not erase data immediately. An operator must review and perform eligible deletion, including Classic data where applicable. Safety, security or recovery records may need retention. Do not send additional sensitive information in the request.',
      'Operator contact details, jurisdiction, retention periods and a staffed request process still require owner configuration and legal review. This policy does not certify legal compliance. Children should not share personal information; this service does not currently provide a verified guardian-consent workflow. The operator must assess child-directed use before inviting children to create accounts.',
    ],
  },
  '/terms': {
    title: 'Terms of Service',
    paragraphs: [
      'Use your own artist identity and protect its recovery secret. You may create, continue and remove your own contributions subject to Community Rules, storage limits and moderation. You may not edit or erase another artist’s work. In Classic remote mode, ownership is enforced at chunk level; older chunks with uncertain ownership can remain read-only.',
      'You retain rights you hold in your artwork. By publishing, you permit the service to store, render and display it with public attribution and to keep recovery and moderation records. Only upload material you own or have permission to share. Other visitors may view or export the public canvas; do not publish private information.',
      'Content may be blocked or hidden after review. Availability, safety, permanent storage, backups and uninterrupted access are not guaranteed. Export and account recovery depend on the device, browser and credentials. Read the Privacy Policy before publishing.',
      'Demo coins are local play currency with no cash value and cannot be transferred. Rewarded ads, when enabled, grant a random 15–25 demo gems after the ad provider signals that the reward was granted. No real payment checkout is connected in this version. Operator identity, jurisdiction and any additional legal terms require owner review; these terms do not remove rights available under applicable law.',
    ],
  },
  '/cookies': {
    title: 'Cookies & device storage',
    paragraphs: [
      'Classic authentication uses the essential fn.sid session cookie where server sessions are enabled. Local storage holds the permanent identity secret, draft preference and drafts, publication retry queue, interface preferences, exploration progress, demo currency and your optional advertising choice. IndexedDB holds local Classic work/cache. The service worker caches the app shell for offline access.',
      'Local storage and IndexedDB are not cookies, but they also store information on your device. If the operator enables ads, this page offers an Allow or Decline choice for optional advertising. Ad scripts remain blocked until you allow them and a configured consent platform reports a permitted choice.',
      'You can remove storage using browser settings. Doing so can lose identity access, drafts and local creations. Save your recovery secret and export work first. Use the controls below to change your advertising choice. In the EEA, UK and Switzerland, Google requires a certified IAB TCF consent platform for personalized ads; this in-app preference does not replace that platform.',
    ],
  },
  '/refunds': {
    title: 'Payments & refunds',
    paragraphs: [
      'This version does not accept real payments. Demo coins are stored locally, have no cash value, cannot be withdrawn and are not a purchased balance. Free demo grants are capped at 3,000 per grant with a 24-hour device cooldown and a 100,000 balance cap. Existing larger balances are preserved; browser storage can be reset or edited, so this is not a financial security system.',
      'There is no real purchase to refund through the current app. A future real payment service requires clear prices, operator details and an appropriate refund policy before launch.',
    ],
  },
};
type Report = {
  id: string;
  target_type: string;
  target_id: string;
  category: string;
  status: string;
  reason?: string;
  automatic_hidden?: boolean;
};
type PendingMedia = {
  id: string;
  mime: string;
  width: number;
  height: number;
  owner_name: string;
  created_at: string;
};
type PendingUpload = Pick<PendingMedia, 'id' | 'mime' | 'width' | 'height' | 'created_at'>;
type Safety = {
  rulesVersion: string;
  accepted: boolean;
  moderator: boolean;
  deletionRequest: { id: string; status: string } | null;
  reports: Report[];
  pendingUploads: PendingUpload[];
  mediaReviews: Array<{ id: string; action: 'approve' | 'reject'; created_at: string }>;
};
export function PolicyLinks() {
  const locale = useLocale();
  const titleKeys: Record<string, Parameters<typeof translate>[0]> = {
    '/community': 'policy.community',
    '/privacy': 'policy.privacy',
    '/terms': 'policy.terms',
    '/cookies': 'policy.cookies',
    '/refunds': 'policy.refunds',
  };
  return (
    <nav
      className="policy-links"
      aria-label={locale === 'ar' ? 'السياسات والمساعدة' : 'Policies and help'}
      dir={locale === 'ar' ? 'rtl' : 'ltr'}
    >
      {Object.entries(pages).map(([path]) => (
        <a key={path} href={path}>
          {translate(titleKeys[path], locale)}
        </a>
      ))}
      <a href="/safety">{translate('policy.safety', locale)}</a>
      <a href="/THIRD_PARTY_NOTICES.txt">{translate('policy.thirdParty', locale)}</a>
    </nav>
  );
}
function SafetyCenter() {
  const token = readSaved<{ token?: string }>('fn_canvas_identity', {}).token || null;
  const [state, setState] = useState<Safety | null>(null),
    [notice, setNotice] = useState('');
  const [type, setType] = useState(new URLSearchParams(location.search).get('type') || 'artwork');
  const [target, setTarget] = useState(new URLSearchParams(location.search).get('id') || '');
  const [category, setCategory] = useState('other'),
    [reason, setReason] = useState('');
  const [queue, setQueue] = useState<{
    reports: Report[];
    deletionRequests: { id: string; user_id: string; status: string }[];
    pendingMedia: PendingMedia[];
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const refresh = async () => setState(await api<Safety>('/safety', token));
  useEffect(() => {
    if (token)
      void api<Safety>('/safety', token)
        .then(setState)
        .catch((e) => setNotice(e.message));
  }, [token]);
  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    try {
      await work();
      await refresh();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Request failed.');
    } finally {
      setBusy(false);
    }
  };
  if (!token)
    return (
      <p>
        <a href="/">Create or restore your artist identity</a> to submit a verified request. Do not
        share your recovery secret in a report.
      </p>
    );
  return (
    <>
      <p>
        Reports need human review. Three distinct open reports can temporarily hide eligible content
        until review; this is not an automatic image safety scan. New media uploads remain private
        until a moderator approves them. Do not include private information in reports.
      </p>
      <p role="status">{notice}</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            const result = await api<{ id: string }>('/reports', token, {
              targetType: type,
              targetId: target,
              category,
              reason,
            });
            setNotice('Report received: ' + result.id);
          });
        }}
      >
        <h2>Report content</h2>
        <label>
          Content type
          <select value={type} onChange={(e) => setType(e.target.value)}>
            {['artwork', 'chat', 'profile', 'media'].map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <label>
          Content ID
          <input
            required
            maxLength={120}
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          />
        </label>
        <label>
          Reason
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            {[
              'sexual-content',
              'child-safety',
              'harassment',
              'hate',
              'threats',
              'graphic-violence',
              'private-information',
              'malicious-content',
              'profanity',
              'other',
            ].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label>
          Optional context
          <textarea maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
        <button disabled={busy}>Submit report</button>
      </form>
      <h2>Your reports</h2>
      {state?.reports.map((r) => (
        <p key={r.id}>
          {r.target_type} {r.target_id}: {r.status}
          {r.automatic_hidden ? ' — automatically hidden for review' : ''} (reference {r.id})
        </p>
      ))}
      <h2>My media awaiting review</h2>
      {state?.pendingUploads.length ? (
        <ul>
          {state.pendingUploads.map((upload) => (
            <li key={upload.id}>
              {upload.mime} · {upload.width} × {upload.height} · submitted{' '}
              {new Date(upload.created_at).toLocaleString()} · reference {upload.id}
            </li>
          ))}
        </ul>
      ) : (
        <p>No uploads are waiting for review.</p>
      )}
      <h2>Recent media review decisions</h2>
      {state?.mediaReviews.length ? (
        <ul>
          {state.mediaReviews.map((review, index) => (
            <li key={`${review.id}:${review.action}:${index}`}>
              {review.action === 'approve' ? 'Approved' : 'Rejected'} · {review.id} ·{' '}
              {new Date(review.created_at).toLocaleString()}
            </li>
          ))}
        </ul>
      ) : (
        <p>No review decisions are recorded yet.</p>
      )}
      <h2>Request deletion of my identity data</h2>
      <p>
        This submits an authenticated request for operator review. It does not erase your account or
        history immediately. Keep the reference and your recovery secret to check its status. You
        can remove your own published artwork from your canvas profile.
      </p>
      {state?.deletionRequest ? (
        <p>
          Reference: {state.deletionRequest.id}. Status: {state.deletionRequest.status}.
        </p>
      ) : (
        <button
          disabled={busy}
          onClick={() => {
            if (
              confirm(
                'Request operator review to delete your identity data and eligible content? This is a request, not immediate erasure.',
              )
            )
              void run(async () => {
                await api('/data-deletion-requests', token, {
                  confirm: 'Request deletion of my identity data',
                });
                setNotice('Deletion request recorded.');
              });
          }}
        >
          Request data deletion
        </button>
      )}
      {state?.moderator && (
        <section>
          <h2>Moderator review</h2>
          <button
            disabled={busy}
            onClick={() => void run(async () => setQueue(await api('/moderation/queue', token)))}
          >
            Load review queue
          </button>
          {queue?.reports.map((r) => (
            <article key={r.id}>
              <p>
                {r.target_type}: {r.target_id} — {r.category}
              </p>
              <p>{r.reason}</p>
              {r.automatic_hidden && (
                <p role="status">
                  Automatically hidden while at least three distinct artists have open reports.
                </p>
              )}
              {['hide', 'dismiss'].map((action) => (
                <button
                  key={action}
                  disabled={busy}
                  onClick={() => {
                    if (confirm(action + ' report ' + r.id + '?'))
                      void run(async () => {
                        await api('/moderation/reports/' + r.id, token, { action });
                        setQueue(await api('/moderation/queue', token));
                      });
                  }}
                >
                  {action}
                </button>
              ))}
            </article>
          ))}
          <h3>New media held for review</h3>
          {queue?.pendingMedia.length ? (
            queue.pendingMedia.map((media) => (
              <article key={media.id}>
                <h4>Upload from {media.owner_name}</h4>
                <p>
                  {media.mime} · {media.width} × {media.height} ·{' '}
                  {new Date(media.created_at).toLocaleString()}
                </p>
                <ModerationMediaPreview media={media} token={token} />
                <button
                  disabled={busy}
                  onClick={() => {
                    if (confirm('Approve this image for public display?'))
                      void run(async () => {
                        await api('/moderation/media/' + media.id, token, { action: 'approve' });
                        setQueue(await api('/moderation/queue', token));
                      });
                  }}
                >
                  Approve for public use
                </button>
                <button
                  disabled={busy}
                  onClick={() => {
                    if (confirm('Reject this upload and keep it hidden?'))
                      void run(async () => {
                        await api('/moderation/media/' + media.id, token, { action: 'reject' });
                        setQueue(await api('/moderation/queue', token));
                      });
                  }}
                >
                  Reject and keep hidden
                </button>
              </article>
            ))
          ) : (
            <p>No media waiting for review.</p>
          )}
          <h3>Pending data deletion requests</h3>
          {queue?.deletionRequests.map((r) => (
            <p key={r.id}>
              {r.id} — artist {r.user_id}: {r.status}. Requires operator processing.
            </p>
          ))}
        </section>
      )}
    </>
  );
}
function ModerationMediaPreview({ media, token }: { media: PendingMedia; token: string }) {
  const [src, setSrc] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    let url = '';
    const controller = new AbortController();
    void fetch('/api/canvas/moderation/media/' + encodeURIComponent(media.id), {
      headers: { Authorization: 'Bearer ' + token },
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('Preview is not available.');
        url = URL.createObjectURL(await response.blob());
        setSrc(url);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted)
          setError(reason instanceof Error ? reason.message : 'Preview is not available.');
      });
    return () => {
      controller.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [media.id, token]);
  return error ? (
    <p role="status">{error}</p>
  ) : src ? (
    <img
      src={src}
      alt={`Pending ${media.mime} upload from ${media.owner_name}`}
      style={{
        display: 'block',
        maxWidth: 'min(100%, 512px)',
        maxHeight: 512,
        objectFit: 'contain',
      }}
    />
  ) : (
    <p role="status">Loading private review preview…</p>
  );
}
export function PolicyPage() {
  const page = pages[location.pathname];
  const locale = useLocale();
  return (
    <main className="policy-page" lang="en" dir="ltr">
      <div className="policy-page-controls">
        <a href="/" lang={locale} dir="auto">
          {translate('policy.back', locale)}
        </a>
        <LocaleControl />
      </div>
      {locale === 'ar' && (
        <p lang="ar" dir="rtl">
          {translate('policy.note', locale)}
        </p>
      )}
      <h1>{page?.title || 'Safety & privacy'}</h1>
      <p>Version {RULES_VERSION}</p>
      {page?.paragraphs.map((p, i) => (
        <p key={i}>{p}</p>
      ))}
      {location.pathname === '/cookies' && <AdConsentSettings />}
      {location.pathname === '/safety' && <SafetyCenter />}
      <PolicyLinks />
    </main>
  );
}
export const isPolicyPage = (path: string) => path in pages || path === '/safety';
