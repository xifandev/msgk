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

// 金额千分位，用于大额展示：1234.5 → 1,234.50
function formatAmount(value) {
  const num = Number(value);
  if (isNaN(num)) {
    return '0.00';
  }
  const fixed = Math.abs(num).toFixed(2);
  const parts = fixed.split('.');
  const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${num < 0 ? '-' : ''}${intPart}.${parts[1]}`;
}

module.exports = { formatDate, formatMoney, formatAmount };
