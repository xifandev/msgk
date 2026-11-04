// 自研图标集：内联 SVG（通过 mask 上色），不依赖任何图标字体或外链资源
const RAW = {
  // 勾选圆环
  passed:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="#000" stroke-width="1.8"/><path d="M7.8 12.2l2.8 2.8 5.6-6" fill="none" stroke="#000" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  // 上下切换箭头
  sort:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12 3.4l4.4 4.8H7.6z" fill="#000"/><path d="M12 20.6l-4.4-4.8h8.8z" fill="#000"/></svg>',
  'arrow-up':
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M5.8 15.2L12 9l6.2 6.2" fill="none" stroke="#000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  'arrow-down':
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M5.8 8.8L12 15l6.2-6.2" fill="none" stroke="#000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  arrow:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" fill="none" stroke="#000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  play:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M9.5 5.5l6.5 6.5-6.5 6.5" fill="none" stroke="#000" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  // 铃铛
  bell:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12 2.8c-3 0-5.3 2.4-5.3 5.3v3.5L5 15.2c-.3.6.1 1.3.8 1.3h12.4c.7 0 1.1-.7.8-1.3l-1.7-3.6V8.1c0-2.9-2.3-5.3-5.3-5.3z" fill="#000"/><path d="M9.7 17.6a2.4 2.4 0 0 0 4.6 0z" fill="#000"/></svg>',
  // 人员
  manager:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="7.6" r="4.2" fill="#000"/><path d="M3.6 20.4c0-3.7 3.8-6.4 8.4-6.4s8.4 2.7 8.4 6.4z" fill="#000"/></svg>',
  // 齿轮
  setting:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill-rule="evenodd" d="M12 2.4l1.8 2.1 2.7-.6.6 2.7 2.5 1.2-1.1 2.5 1.1 2.5-2.5 1.2-.6 2.7-2.7-.6L12 21.6l-1.8-2.1-2.7.6-.6-2.7-2.5-1.2 1.1-2.5-1.1-2.5 2.5-1.2.6-2.7 2.7.6zM12 8.3a3.7 3.7 0 1 0 0 7.4 3.7 3.7 0 0 0 0-7.4z" fill="#000"/></svg>',
  // 钱包
  'balance-pay':
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M3.4 8.2A2.4 2.4 0 0 1 5.8 5.8h10.4c.9 0 1.6.7 1.6 1.6v1.2" fill="none" stroke="#000" stroke-width="1.8" stroke-linejoin="round"/><rect x="3.4" y="8" width="17.2" height="10.4" rx="2.2" fill="none" stroke="#000" stroke-width="1.8"/><path d="M15.6 13.2h3" fill="none" stroke="#000" stroke-width="2" stroke-linecap="round"/></svg>',
  // 文档
  column:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M6.2 3.6h7.6L18.6 8.4v12h-12.4z" fill="none" stroke="#000" stroke-width="1.8" stroke-linejoin="round"/><path d="M13.6 3.6v4.9h5" fill="none" stroke="#000" stroke-width="1.8" stroke-linejoin="round"/><path d="M9 12.4h6.6M9 15.6h6.6M9 9.2h3.2" fill="none" stroke="#000" stroke-width="1.7" stroke-linecap="round"/></svg>',
  star:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12 2.8l2.9 5.9 6.5.9-4.7 4.6 1.1 6.4-5.8-3.1-5.8 3.1 1.1-6.4L2.6 9.6l6.5-.9z" fill="#000"/></svg>',
  contact:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9.2" fill="none" stroke="#000" stroke-width="1.6"/><circle cx="12" cy="9.8" r="3.1" fill="none" stroke="#000" stroke-width="1.6"/><path d="M5.9 18.6c1.3-2.2 3.5-3.4 6.1-3.4s4.8 1.2 6.1 3.4" fill="none" stroke="#000" stroke-width="1.6" stroke-linecap="round"/></svg>',
  'bulb-o':
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M9.4 17.6h5.2M10.2 20.4h3.6" fill="none" stroke="#000" stroke-width="1.7" stroke-linecap="round"/><path d="M12 3.2a5.9 5.9 0 0 0-3.6 10.6c.7.5 1.1 1.3 1.1 2.1v.4h5v-.4c0-.8.4-1.6 1.1-2.1A5.9 5.9 0 0 0 12 3.2z" fill="none" stroke="#000" stroke-width="1.7" stroke-linejoin="round"/></svg>',
  'balance-list':
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M4 6.4h16M4 12h9.6M4 17.6h6.4" fill="none" stroke="#000" stroke-width="1.8" stroke-linecap="round"/><circle cx="17.6" cy="16.8" r="3.2" fill="none" stroke="#000" stroke-width="1.8"/><path d="M17.6 15.4v2.8" fill="none" stroke="#000" stroke-width="1.6" stroke-linecap="round"/></svg>',
  cross:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="#000" stroke-width="2.2" stroke-linecap="round"/></svg>',
  checked:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M4.6 12.6l4.7 4.7L19.4 6.8" fill="none" stroke="#000" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  warning:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9.2" fill="#000"/><path d="M12 6.8v6.4" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="16.8" r="1.3" fill="#fff"/></svg>',
  phone:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M7.2 3.6c.9 0 1.7.6 1.9 1.5l.6 2.3c.2.7-.1 1.4-.7 1.8l-1 .7a11.4 11.4 0 0 0 5.1 5.1l.7-1c.4-.6 1.1-.9 1.8-.7l2.3.6c.9.2 1.5 1 1.5 1.9v2.1c0 1.2-1 2.2-2.2 2.1C9.5 20.5 3.5 14.5 3.1 6.9 3 5.7 4 4.7 5.2 4.7z" fill="#000"/></svg>',
};

function toUri(svg) {
  return (
    'data:image/svg+xml;charset=utf8,' +
    encodeURIComponent(svg).replace(/\(/g, '%28').replace(/\)/g, '%29')
  );
}

const URI = {};
Object.keys(RAW).forEach((name) => {
  URI[name] = toUri(RAW[name]);
});

module.exports = { URI, NAMES: Object.keys(RAW) };
