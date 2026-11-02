export type HotkeyAction = 'new-flight' | 'search';

type HotkeyEvent = Pick<KeyboardEvent, 'code' | 'ctrlKey' | 'metaKey' | 'altKey' | 'target'>;

const TEXT_INPUT_TAGS = ['INPUT', 'TEXTAREA', 'SELECT'];

/** Uses physical key codes, so shortcuts also work on the Russian keyboard layout. */
export function resolveHotkey(event: HotkeyEvent, hasOpenDialog: boolean): HotkeyAction | null {
  if (hasOpenDialog || event.ctrlKey || event.metaKey || event.altKey) return null;

  const target = event.target as { tagName?: string; isContentEditable?: boolean } | null;
  if (target?.isContentEditable || TEXT_INPUT_TAGS.includes(target?.tagName || '')) return null;

  if (event.code === 'KeyN') return 'new-flight';
  if (event.code === 'Slash') return 'search';
  return null;
}
