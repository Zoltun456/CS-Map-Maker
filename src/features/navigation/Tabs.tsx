import { useRef, type KeyboardEvent } from 'react';
import { useApp, type AppTab } from '../../app/state';

const TABS: Array<[AppTab, string]> = [
  ['lab', 'Layout lab'],
  ['agent', 'Agent tools'],
  ['guide', 'Build guide'],
  ['themes', 'Themes'],
  ['permafrost', 'Permafrost'],
];

export function Tabs() {
  const { tab, setTab } = useApp();
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  const select = (value: AppTab, focus = false) => {
    setTab(value);
    if (focus) buttons.current[TABS.findIndex(([id]) => id === value)]?.focus();
  };
  const onKeyDown = (event: KeyboardEvent, index: number) => {
    const next =
      event.key === 'ArrowRight'
        ? (index + 1) % TABS.length
        : event.key === 'ArrowLeft'
          ? (index - 1 + TABS.length) % TABS.length
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? TABS.length - 1
              : null;
    if (next === null) return;
    event.preventDefault();
    select(TABS[next][0], true);
  };
  return (
    <nav className="tabs" role="tablist" aria-label="Map Lab sections">
      {TABS.map(([id, label], index) => (
        <button
          key={id}
          ref={(element) => {
            buttons.current[index] = element;
          }}
          role="tab"
          id={`tab-${id}`}
          aria-controls={`panel-${id}`}
          aria-selected={tab === id}
          tabIndex={tab === id ? 0 : -1}
          onClick={() => select(id)}
          onKeyDown={(event) => onKeyDown(event, index)}
        >
          {label}
        </button>
      ))}
    </nav>
  );
}
