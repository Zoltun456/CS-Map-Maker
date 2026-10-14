import { useRef, type MouseEvent } from 'react';
import { useApp } from '../app/state';
import guideHtml from './guide.html?raw';

export function GuidePage() {
  const { showToast } = useApp();
  const root = useRef<HTMLDivElement>(null);
  const onClick = (event: MouseEvent<HTMLDivElement>) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-copy]');
    if (!button || !root.current) return;
    const source = root.current.querySelector<HTMLElement>(`#${button.dataset.copy}`);
    if (source)
      void navigator.clipboard.writeText(source.textContent ?? '').then(() => showToast('Copied'));
  };
  return (
    <div
      ref={root}
      className="doc"
      onClick={onClick}
      dangerouslySetInnerHTML={{ __html: guideHtml }}
    />
  );
}
