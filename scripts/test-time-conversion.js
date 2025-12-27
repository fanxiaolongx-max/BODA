// 测试时间转换函数
function getCurrentLocalTimeISOString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  const milliseconds = String(now.getMilliseconds()).padStart(3, '0');
  
  const timezoneOffset = -now.getTimezoneOffset();
  const offsetHours = String(Math.floor(Math.abs(timezoneOffset) / 60)).padStart(2, '0');
  const offsetMinutes = String(Math.abs(timezoneOffset) % 60).padStart(2, '0');
  const offsetSign = timezoneOffset >= 0 ? '+' : '-';
  
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${milliseconds}${offsetSign}${offsetHours}:${offsetMinutes}`;
}

function convertUTCToLocalISOString(utcTimeString) {
  try {
    const utcDate = new Date(utcTimeString);
    if (isNaN(utcDate.getTime())) {
      return getCurrentLocalTimeISOString();
    }
    
    const year = utcDate.getFullYear();
    const month = String(utcDate.getMonth() + 1).padStart(2, '0');
    const day = String(utcDate.getDate()).padStart(2, '0');
    const hours = String(utcDate.getHours()).padStart(2, '0');
    const minutes = String(utcDate.getMinutes()).padStart(2, '0');
    const seconds = String(utcDate.getSeconds()).padStart(2, '0');
    const milliseconds = String(utcDate.getMilliseconds()).padStart(3, '0');
    
    const timezoneOffset = -utcDate.getTimezoneOffset();
    const offsetHours = String(Math.floor(Math.abs(timezoneOffset) / 60)).padStart(2, '0');
    const offsetMinutes = String(Math.abs(timezoneOffset) % 60).padStart(2, '0');
    const offsetSign = timezoneOffset >= 0 ? '+' : '-';
    
    return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${milliseconds}${offsetSign}${offsetHours}:${offsetMinutes}`;
  } catch (error) {
    console.error('转换失败:', error.message);
    return getCurrentLocalTimeISOString();
  }
}

// 测试不同的时间格式
const testTimes = [
  'Sat, 27 Dec 2025 00:00:01 +0000',  // RFC 2822格式（API实际返回）
  '2025-12-27T00:00:01Z',              // ISO 8601格式
  '2025-12-27T00:00:01.000Z',          // ISO 8601格式（带毫秒）
  '2025-12-24T18:42:33.423Z'           // 旧数据格式
];

console.log('=== 测试时间转换 ===\n');

testTimes.forEach(timeStr => {
  console.log(`输入: ${timeStr}`);
  const date = new Date(timeStr);
  console.log(`  解析为Date: ${date.toISOString()}`);
  console.log(`  本地时间: ${date.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`);
  console.log(`  埃及时间: ${date.toLocaleString('zh-CN', { timeZone: 'Africa/Cairo' })}`);
  
  const converted = convertUTCToLocalISOString(timeStr);
  console.log(`  转换后: ${converted}`);
  console.log('');
});

