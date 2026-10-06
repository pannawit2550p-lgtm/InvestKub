'use client';

/* eslint-disable @next/next/no-img-element -- Persisted logo URLs have provider-specific hosts; use direct, lazy images instead of requiring a fixed Next image-host allowlist. */
import { useState } from 'react';

interface AssetLogoProps {
  symbol: string;
  logoUrl?: string | null;
  size?: number;
  className?: string;
}

function isSafeLogoUrl(value: string): boolean {
  if (value.startsWith('/') && !value.startsWith('//')) return true;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

export default function AssetLogo({ symbol, logoUrl, size = 48, className }: AssetLogoProps) {
  const source = logoUrl?.trim() ?? '';
  const [failedSource, setFailedSource] = useState('');
  const showImage = Boolean(source && isSafeLogoUrl(source) && failedSource !== source);

  return <span className={`asset-row-logo${showImage ? ' has-image' : ''}${className ? ` ${className}` : ''}`} style={{ width: size, height: size, flexBasis: size, fontSize: size === 36 ? 15 : undefined, padding: showImage && size === 36 ? Math.round(size * .12) : undefined }} aria-hidden="true">
    {showImage ? <img src={source} width={size} height={size} alt="" loading="lazy" decoding="async" onError={() => setFailedSource(source)} /> : symbol.slice(0, 1)}
  </span>;
}
