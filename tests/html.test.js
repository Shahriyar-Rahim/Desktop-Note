import { describe, it, expect } from 'vitest';
import { sanitizeNoteHtml, htmlToText, htmlToMarkdown, markdownToHtml, plainTextToHtml, noteToHtmlDocument } from '../electron/services/htmlUtils.js';

describe('html utilities', () => {
  it('removes scripts, event handlers and javascript: links', () => {
    const out = sanitizeNoteHtml('<p onmouseover="x()">a</p><img src=x onerror=alert(1)><script>1</script><a href="javascript:alert(1)">b</a><iframe src="//x"></iframe>');
    expect(out).toContain('<p>a</p>');
    expect(out).not.toMatch(/script|onmouseover|onerror|javascript:|href|iframe|<img/);
  });
  it('keeps safe links and adds rel', () => {
    expect(sanitizeNoteHtml('<a href="https://example.com">x</a>')).toContain('rel="noopener noreferrer nofollow"');
  });
  it('keeps editor checklists', () => {
    const html = '<ul data-type="taskList"><li data-type="taskItem" data-checked="true"><label><input type="checkbox" checked="checked"><span></span></label><div><p>x</p></div></li></ul>';
    expect(sanitizeNoteHtml(html)).toContain('data-checked="true"');
  });
  it('extracts plain text with line breaks and decodes entities', () => {
    expect(htmlToText('<p>a &amp; b</p><p>c</p>')).toBe('a & b\nc');
  });
  it('converts formatting and checklists to Markdown', () => {
    const md = htmlToMarkdown('<h2>T</h2><p><strong>b</strong> <em>i</em></p><ul data-type="taskList"><li data-type="taskItem" data-checked="true"><label><input type="checkbox" checked><span></span></label><div><p>done</p></div></li><li data-type="taskItem" data-checked="false"><label><input type="checkbox"><span></span></label><div><p>todo</p></div></li></ul>');
    expect(md).toContain('## T');
    expect(md).toContain('**b** *i*');
    expect(md).toContain('- [x] done');
    expect(md).toContain('- [ ] todo');
  });
  it('converts Markdown to safe HTML with checklists', () => {
    const html = markdownToHtml('# Hi\n\n- [x] a\n- [ ] b\n\n<script>x</script>');
    expect(html).toContain('<h1>Hi</h1>');
    expect(html).toContain('data-type="taskList"');
    expect(html).toContain('data-checked="true"');
    expect(html).not.toContain('script');
  });
  it('escapes plain text', () => {
    expect(plainTextToHtml('<b>x</b>\nline 2')).toBe('<p>&lt;b&gt;x&lt;/b&gt;</p><p>line 2</p>');
  });
  it('builds a script-free PDF document', () => {
    const doc = noteToHtmlDocument({ title: '<x>', content_html: '<p>hi</p><script>1</script>' });
    expect(doc).toContain('&lt;x&gt;');
    expect(doc).not.toContain('<script>');
  });
});
