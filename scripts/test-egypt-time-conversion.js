// 测试埃及时区转换函数
function convertUTCToEgyptISOString(utcTimeString) {
  try {
    const utcDate = new Date(utcTimeString);
    if (isNaN(utcDate.getTime())) {
      return null;
    }
    
    // 使用埃及时区（UTC+2）进行转换
    const utcYear = utcDate.getUTCFullYear();
    const utcMonth = String(utcDate.getUTCMonth() + 1).padStart(2, '0');
    const utcDay = String(utcDate.getUTCDate()).padStart(2, '0');
    const utcHours = utcDate.getUTCHours();
    const utcMinutes = String(utcDate.getUTCMinutes()).padStart(2, '0');
    const utcSeconds = String(utcDate.getUTCSeconds()).padStart(2, '0');
    const utcMilliseconds = String(utcDate.getUTCMilliseconds()).padStart(3, '0');
    
    // 转换为埃及时区（UTC+2）
    const egyptHours = (utcHours + 2) % 24;
    
    // 处理跨天的情况
    let finalDay = utcDay;
    let finalMonth = utcMonth;
    let finalYear = utcYear;
    if (utcHours + 2 >= 24) {
      const tempDate = new Date(Date.UTC(utcYear, utcDate.getUTCMonth(), parseInt(utcDay) + 1));
      finalDay = String(tempDate.getUTCDate()).padStart(2, '0');
      finalMonth = String(tempDate.getUTCMonth() + 1).padStart(2, '0');
      finalYear = tempDate.getUTCFullYear();
    }
    
    const finalHours = String(egyptHours).padStart(2, '0');
    
    return `${finalYear}-${finalMonth}-${finalDay}T${finalHours}:${utcMinutes}:${utcSeconds}.${utcMilliseconds}+02:00`;
  } catch (error) {
    console.error('转换失败:', error.message);
    return null;
  }
}

// 测试不同的时间格式
const testTimes = [
  'Sat, 27 Dec 2025 00:00:01 +0000',  // RFC 2822格式（API实际返回）
  '2025-12-27T00:00:01Z',              // ISO 8601格式
  '2025-12-24T18:42:33.423Z'           // 旧数据格式
];

console.log('=== 测试埃及时区转换 ===\n');

testTimes.forEach(timeStr => {
  console.log(`输入: ${timeStr}`);
  const date = new Date(timeStr);
  console.log(`  UTC时间: ${date.toISOString()}`);
  console.log(`  埃及时间显示: ${date.toLocaleString('zh-CN', { timeZone: 'Africa/Cairo' })}`);
  
  const converted = convertUTCToEgyptISOString(timeStr);
  console.log(`  转换后: ${converted}`);
  console.log('');
});

