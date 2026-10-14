import { type MouseEvent } from 'react';
import { useApp } from '../app/state';
import { permafrostMap } from './maps';
import permafrostHtml from './permafrost.html?raw';

export function PermafrostPage() {
  const app = useApp();
  const onClick = (event: MouseEvent<HTMLDivElement>) => {
    if (!(event.target as HTMLElement).closest('[data-load="permafrost"]')) return;
    app.commitMap(permafrostMap());
    app.setTab('lab');
    app.setOverlay('plain');
    app.showToast('Permafrost loaded');
  };
  return (
    <div className="doc" onClick={onClick} dangerouslySetInnerHTML={{ __html: permafrostHtml }} />
  );
}
