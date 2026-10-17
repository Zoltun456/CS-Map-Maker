import type { ParsedPortableMap } from './agentTypes';
import { parsePortableMap } from './portableMap';
import { parsePortableMapV2, type PortableMapFileV2 } from './portableV2';
import type { MapDocumentV2 } from './documentV2';

export type ParsedMapDocument =
  | { version: 1; parsed: ParsedPortableMap }
  | { version: 2; file: PortableMapFileV2; document: MapDocumentV2 };

export function parseMapDocument(source: string | unknown): ParsedMapDocument {
  const value = typeof source === 'string' ? (JSON.parse(source) as unknown) : source;
  if (value && typeof value === 'object' && (value as { version?: unknown }).version === 2) {
    const parsed = parsePortableMapV2(value);
    return { version: 2, ...parsed };
  }
  const text = typeof source === 'string' ? source : JSON.stringify(value);
  return { version: 1, parsed: parsePortableMap(text) };
}
