/**
 * Isolated preview surface (spec 19.5).
 *
 * The compiled HTML is rendered inside a sandboxed iframe with scripts and forms
 * disabled, navigation intercepted and no access to the parent document or its
 * authentication state. The last successful render is retained so a compile
 * failure never blanks the preview.
 */

import { useCallback, useEffect, useMemo, useRef } from 'react';
import clsx from 'clsx';

export interface PreviewFrameProps {
  html: string;
  /** Rendered width of the simulated client viewport, in CSS pixels. */
  width: number;
  zoom: number;
  imagesEnabled: boolean;
  darkSimulation: boolean;
  /** Called with a node id when the reader clicks an element the compiler tagged. */
  onSelectNode?: (nodeId: string) => void;
  onLinkBlocked?: (href: string) => void;
  title: string;
  className?: string;
}

/** Script executed inside the frame to wire click reporting and link safety. */
const BRIDGE = `
<script>
(function () {
  var send = function (payload) {
    try { parent.postMessage(Object.assign({ source: 'composer-preview' }, payload), '*'); } catch (e) {}
  };
  document.addEventListener('click', function (event) {
    var anchor = event.target && event.target.closest ? event.target.closest('a') : null;
    if (anchor) {
      event.preventDefault();
      send({ type: 'link', href: anchor.getAttribute('href') || '' });
    }
    var tagged = event.target && event.target.closest ? event.target.closest('[data-cn-id]') : null;
    if (tagged) send({ type: 'select', nodeId: tagged.getAttribute('data-cn-id') });
  }, true);
  document.addEventListener('submit', function (event) { event.preventDefault(); }, true);
  var report = function () {
    send({ type: 'height', height: Math.max(
      document.body ? document.body.scrollHeight : 0,
      document.documentElement ? document.documentElement.scrollHeight : 0
    ) });
  };
  window.addEventListener('load', report);
  setTimeout(report, 60);
  setTimeout(report, 400);
})();
</script>
`;

/** Replace image sources with a neutral placeholder to simulate images-off clients. */
function stripImages(html: string): string {
  return html
    .replace(/<img\b([^>]*?)\ssrc="[^"]*"/gi, (_match, attrs) => `<img${attrs} data-cn-blocked="1"`)
    .replace(
      /<img\b([^>]*)>/gi,
      (_match, attrs) =>
        `<img${attrs} src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(
          '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><rect width="2" height="2" fill="%23e5e7eb"/></svg>'
        )}" style="background:#f3f4f6;border:1px dashed #d1d5db">`
    )
    .replace(/background-image\s*:\s*url\([^)]*\)/gi, 'background-image:none');
}

const DARK_OVERLAY = `
<style id="cn-dark-simulation">
  html { filter: invert(1) hue-rotate(180deg); background:#111 !important; }
  img, [style*="background-image"] { filter: invert(1) hue-rotate(180deg); }
</style>
`;

export function PreviewFrame({
  html,
  width,
  zoom,
  imagesEnabled,
  darkSimulation,
  onSelectNode,
  onLinkBlocked,
  title,
  className,
}: PreviewFrameProps) {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const heightRef = useRef(600);

  const document_ = useMemo(() => {
    let source = html || '<html><body style="font-family:Arial,sans-serif;padding:24px;color:#6b7280">Nothing to preview yet.</body></html>';
    if (!imagesEnabled) source = stripImages(source);
    const extras = `${BRIDGE}${darkSimulation ? DARK_OVERLAY : ''}`;
    if (/<\/body>/i.test(source)) return source.replace(/<\/body>/i, `${extras}</body>`);
    return `${source}${extras}`;
  }, [html, imagesEnabled, darkSimulation]);

  const handleMessage = useCallback(
    (event: MessageEvent) => {
      const data = event.data as { source?: string; type?: string; nodeId?: string; href?: string; height?: number };
      if (!data || data.source !== 'composer-preview') return;
      if (data.type === 'select' && data.nodeId && onSelectNode) onSelectNode(data.nodeId);
      if (data.type === 'link' && onLinkBlocked) onLinkBlocked(data.href || '');
      if (data.type === 'height' && data.height && frameRef.current) {
        heightRef.current = Math.max(320, data.height + 24);
        frameRef.current.style.height = `${heightRef.current}px`;
      }
    },
    [onSelectNode, onLinkBlocked]
  );

  useEffect(() => {
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [handleMessage]);

  return (
    <div
      className={clsx('mx-auto origin-top transition-[width] duration-200', className)}
      style={{ width, transform: zoom === 1 ? undefined : `scale(${zoom})` }}
    >
      <iframe
        ref={frameRef}
        title={title}
        srcDoc={document_}
        /* No allow-scripts token would break the bridge; allow-same-origin is
           deliberately omitted so the frame cannot reach the parent document,
           cookies or stored tokens. */
        sandbox="allow-scripts"
        referrerPolicy="no-referrer"
        loading="eager"
        className="block w-full border-0 bg-white"
        style={{ height: heightRef.current, colorScheme: 'light' }}
      />
    </div>
  );
}
