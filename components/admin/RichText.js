'use client';
// A deliberately small rich-text box: bold, italic, heading, lists, link.
// The HTML is sanitised again on the server before it is saved.
import { useEffect, useRef } from 'react';

const TOOLS = [
  ['bold', 'B', 'Bold'], ['italic', 'I', 'Italic'], ['formatBlock:h3', 'H', 'Heading'],
  ['insertUnorderedList', '•', 'Bullet list'], ['insertOrderedList', '1.', 'Numbered list'], ['createLink', '🔗', 'Link'],
];

export default function RichText({ value, onChange, id }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current && ref.current.innerHTML !== value) ref.current.innerHTML = value || ''; }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function run(cmd) {
    ref.current.focus();
    if (cmd === 'createLink') {
      const url = window.prompt('Link address (https://…)');
      if (url && /^https?:\/\//.test(url)) document.execCommand('createLink', false, url);
    } else if (cmd.startsWith('formatBlock:')) {
      document.execCommand('formatBlock', false, cmd.split(':')[1]);
    } else {
      document.execCommand(cmd);
    }
    onChange(ref.current.innerHTML);
  }

  return (
    <div className="richtext">
      <div className="richtext-tools" role="toolbar" aria-label="Formatting">
        {TOOLS.map(([cmd, label, title]) => (
          <button key={cmd} type="button" className="btn btn-ghost btn-sm" title={title} aria-label={title}
            onMouseDown={(e) => e.preventDefault()} onClick={() => run(cmd)}>{label}</button>
        ))}
      </div>
      <div id={id} ref={ref} className="richtext-area textarea" contentEditable suppressContentEditableWarning
        role="textbox" aria-multiline="true" onInput={(e) => onChange(e.currentTarget.innerHTML)} />
    </div>
  );
}
