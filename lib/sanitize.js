// Allow-list HTML sanitiser for product descriptions. Applied when the admin
// saves a description and again when it is rendered. Anything not explicitly
// allowed (tags, attributes, event handlers, javascript: URLs) is removed.

const ALLOWED = new Set(['p', 'br', 'ul', 'ol', 'li', 'strong', 'b', 'em', 'i', 'u', 'h2', 'h3', 'h4', 'blockquote', 'a', 'hr']);
const VOID = new Set(['br', 'hr']);

export function sanitizeHtml(input) {
  let html = String(input ?? '');
  // Drop dangerous elements together with their content.
  html = html.replace(/<(script|style|iframe|object|embed|template|svg|math|noscript)\b[\s\S]*?<\/\1\s*>/gi, '');
  html = html.replace(/<!--[\s\S]*?-->/g, '');
  return html.replace(/<\/?([a-zA-Z0-9]+)\b([^>]*)>|<|>/g, (match, rawTag, attrs) => {
    if (match === '<') return '&lt;';
    if (match === '>') return '&gt;';
    const tag = rawTag.toLowerCase();
    if (!ALLOWED.has(tag)) return '';
    if (match.startsWith('</')) return VOID.has(tag) ? '' : `</${tag}>`;
    if (tag === 'a') {
      const href = /\bhref\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attrs);
      const url = (href?.[2] ?? href?.[3] ?? href?.[4] ?? '').trim();
      if (/^(https?:|mailto:|tel:|\/(?!\/))/i.test(url)) {
        const safe = url.replace(/"/g, '&quot;');
        return `<a href="${safe}" rel="nofollow noopener noreferrer" target="_blank">`;
      }
      return '<a>';
    }
    return `<${tag}>`;
  });
}

export function stripHtml(input) {
  return String(input ?? '').replace(/<[^>]*>/g, ' ').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim();
}
