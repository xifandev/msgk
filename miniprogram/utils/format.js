// utils/format.js
const pad = (n) => (n < 10 ? `0${n}` : `${n}`);

// 'YYYY-MM-DD HH:mm:ss' / ISO 字符串 → 'YYYY-MM-DD'
function formatDate(value) {
  if (!value) {
    return '';
  }
  if (typeof value === 'string') {
    return value.substring(0, 10);
  }
  const d = new Date(value);
  if (isNaN(d.getTime())) {
    return '';
  }
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// 金额保留两位小数
function formatMoney(value) {
  const num = Number(value);
  if (isNaN(num)) {
    return '0.00';
  }
  return num.toFixed(2);
}

// 当前月份的上一个月 → 'YYYY-MM'
function previousMonth() {
  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth(); // 0-11，减 1 即上月（1 月时为 0）
  if (month === 0) {
    month = 12;
    year -= 1;
  }
  return `${year}-${pad(month)}`;
}

module.exports = { formatDate, formatMoney, previousMonth };
