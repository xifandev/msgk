// utils/richtext.js
// 小程序 rich-text 不继承页面样式，排版样式必须内联到标签上；
// 同时统一修正图片固定宽高导致的横向溢出问题。

// 正文排版（px 在小程序渲染层即逻辑像素，与 750rpx 设计稿等比例）
const STYLES = {
  p: 'margin:0 0 14px;line-height:1.9;font-size:16px;color:#3b3a39;text-align:justify;word-break:break-word;',
  h2: 'margin:24px 0 12px;font-size:19px;line-height:1.5;font-weight:600;color:#1f2329;',
  h3: 'margin:20px 0 10px;font-size:17px;line-height:1.55;font-weight:600;color:#1f2329;',
  h4: 'margin:16px 0 8px;font-size:16px;line-height:1.6;font-weight:600;color:#1f2329;',
  blockquote:
    'margin:16px 0;padding:12px 14px;border-left:3px solid #d31027;background-color:#fbf3f4;color:#5c5f66;font-size:15px;line-height:1.8;border-radius:0 8px 8px 0;',
  ul: 'margin:0 0 14px;padding-left:22px;',
  ol: 'margin:0 0 14px;padding-left:22px;',
  li: 'margin:7px 0;line-height:1.85;font-size:16px;color:#3b3a39;',
  table: 'width:100%;max-width:100%;table-layout:fixed;border-collapse:collapse;margin:14px 0;font-size:14px;color:#3b3a39;word-break:break-word;',
  th: 'border:1px solid #e6e8eb;padding:8px 10px;background-color:#f7f8fa;font-weight:600;text-align:left;line-height:1.6;',
  td: 'border:1px solid #e6e8eb;padding:8px 10px;line-height:1.6;word-break:break-word;',
  a: 'color:#d31027;text-decoration:none;word-break:break-all;',
  hr: 'border:none;border-top:1px solid #eceef1;margin:22px 0;',
};

// 图片：宽度不超过容器、等比缩放、居中显示
const IMG_STYLE =
  'display:block;max-width:100%;height:auto;margin:16px auto;border-radius:8px;';

const BLOCK_TAG = /<(p|div|h[1-6]|ul|ol|table|blockquote|hr|img)\b/i;

function readAttr(tag, name) {
  const matched = tag.match(new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i'));
  if (!matched) {
    return '';
  }
  return (matched[2] || matched[3] || '').trim();
}

function escapeAttr(value) {
  return String(value).replace(/"/g, '&quot;');
}

// 去掉不安全的事件属性与脚本
function stripUnsafe(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
}

// 给指定标签统一追加内联样式（保留标签已有属性）
function applyTagStyle(html, tag, style) {
  if (!style) {
    return html;
  }
  const pattern = new RegExp(`<${tag}(\\s[^>]*?)?\\s*/?>`, 'gi');
  return html.replace(pattern, (_all, attrs) => {
    const rest = String(attrs || '')
      .replace(/\sstyle\s*=\s*("[^"]*"|'[^']*')/gi, '')
      .replace(/\/\s*$/, '')
      .trim();
    return `<${tag}${rest ? ' ' + rest : ''} style="${style}">`;
  });
}

// 无块级标签时按换行拆成段落（保留行内标签）
function toParagraphs(content) {
  return String(content)
    .replace(/<br\s*\/?>/gi, '\n')
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `<p style="${STYLES.p}">${line}</p>`)
    .join('');
}

function stripTags(html) {
  return String(html || '')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .trim();
}

// 富文本是否为空（无文字且无图片）
function isRichTextEmpty(html) {
  const value = String(html || '');
  if (/<img\b/i.test(value)) {
    return false;
  }
  return stripTags(value).length === 0;
}

// 把后台富文本转换成可直接交给 rich-text 的 HTML
function enhanceRichText(html) {
  let content = stripUnsafe(String(html || '').trim());
  if (!content) {
    return '';
  }
  if (isRichTextEmpty(content)) {
    return '';
  }

  // 纯文本内容转成段落，保证有段间距
  if (!BLOCK_TAG.test(content)) {
    content = toParagraphs(content);
  }

  // 图片：丢弃原始 width/height，改为自适应居中
  content = content.replace(/<img\b[^>]*>/gi, (tag) => {
    const src = readAttr(tag, 'src');
    if (!src) {
      return '';
    }
    const alt = readAttr(tag, 'alt');
    return `<img src="${escapeAttr(src)}"${alt ? ` alt="${escapeAttr(alt)}"` : ''} style="${IMG_STYLE}" />`;
  });

  Object.keys(STYLES).forEach((tag) => {
    content = applyTagStyle(content, tag, STYLES[tag]);
  });

  // 主题色分隔线
  return content;
}

module.exports = { enhanceRichText, isRichTextEmpty };
