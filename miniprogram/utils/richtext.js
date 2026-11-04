// utils/richtext.js
// 小程序 rich-text 不继承页面样式，排版样式必须内联到标签上；
// 同时统一修正图片固定宽高导致的横向溢出问题。
//
// rich-text 内部不支持 rpx，这里按屏幕宽度把 rpx 换算成 px，
// 让正文排版与页面其余部分保持同一比例（不同机型字号一致）。

let RATIO = 0.5; // 以 375pt 宽屏幕为基准：1rpx = 0.5px
try {
  const info = (wx.getWindowInfo && wx.getWindowInfo()) || wx.getSystemInfoSync();
  if (info && info.windowWidth) {
    RATIO = info.windowWidth / 750;
  }
} catch (err) {
  // 非小程序环境（如本地脚本）保持默认比例
}

function px(rpx) {
  return `${Math.round(rpx * RATIO * 10) / 10}px`;
}

// 正文排版（按 750rpx 设计稿尺寸书写，运行时换算）
const STYLES = {
  p: `margin:0 0 ${px(28)};line-height:1.9;font-size:${px(32)};color:#3b3a39;text-align:justify;word-break:break-word;`,
  h2: `margin:${px(48)} 0 ${px(24)};font-size:${px(38)};line-height:1.5;font-weight:600;color:#1f2329;`,
  h3: `margin:${px(40)} 0 ${px(20)};font-size:${px(34)};line-height:1.55;font-weight:600;color:#1f2329;`,
  h4: `margin:${px(32)} 0 ${px(16)};font-size:${px(32)};line-height:1.6;font-weight:600;color:#1f2329;`,
  blockquote: `margin:${px(32)} 0;padding:${px(24)} ${px(28)};border-left:${px(6)} solid #d31027;background-color:#fbf3f4;color:#5c5f66;font-size:${px(30)};line-height:1.8;border-radius:0 ${px(16)} ${px(16)} 0;`,
  ul: `margin:0 0 ${px(28)};padding-left:${px(44)};`,
  ol: `margin:0 0 ${px(28)};padding-left:${px(44)};`,
  li: `margin:${px(14)} 0;line-height:1.85;font-size:${px(32)};color:#3b3a39;`,
  table: `width:100%;max-width:100%;table-layout:fixed;border-collapse:collapse;margin:${px(28)} 0;font-size:${px(28)};color:#3b3a39;word-break:break-word;`,
  th: `border:1px solid #e6e8eb;padding:${px(16)} ${px(20)};background-color:#f7f8fa;font-weight:600;text-align:left;line-height:1.6;`,
  td: `border:1px solid #e6e8eb;padding:${px(16)} ${px(20)};line-height:1.6;word-break:break-word;`,
  a: 'color:#d31027;text-decoration:none;word-break:break-all;',
  hr: `border:none;border-top:1px solid #eceef1;margin:${px(44)} 0;`,
};

// 图片：宽度不超过容器、等比缩放、居中显示
const IMG_STYLE = `display:block;max-width:100%;height:auto;margin:${px(32)} auto;border-radius:${px(16)};`;

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

  // 图片全部无效时会留下空段落，这里再判一次空
  if (isRichTextEmpty(content)) {
    return '';
  }

  return content;
}

module.exports = { enhanceRichText, isRichTextEmpty };
