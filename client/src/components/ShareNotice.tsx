import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { shareLink } from '../share';

export function useShareLink() {
  const [result, setResult] = useState({ message: '', link: '' });
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearTimeout(timer.current);
    };
  }, []);
  const share = async (link: string) => {
    const status = await shareLink(link);
    if (!mounted.current || status === 'cancelled') return;
    clearTimeout(timer.current);
    setResult({
      message:
        status === 'copied'
          ? 'Location link copied.'
          : status === 'shared'
            ? 'Location shared.'
            : 'Select and copy this link:',
      link: status === 'manual' ? link : '',
    });
    if (status !== 'manual')
      timer.current = setTimeout(() => setResult({ message: '', link: '' }), 4500);
  };
  const notice = result.message
    ? createPortal(
        <div className="fn-share-notice" role="status">
          <span>{result.message}</span>
          {result.link && (
            <input
              aria-label="Location link"
              readOnly
              value={result.link}
              onFocus={(e) => e.currentTarget.select()}
            />
          )}
          <button
            aria-label="Dismiss share notice"
            onClick={() => setResult({ message: '', link: '' })}
          >
            Dismiss
          </button>
        </div>,
        Array.from(document.querySelectorAll('[aria-modal="true"]')).pop() || document.body,
      )
    : null;
  return { share, notice };
}
