# Session过期时间查询脚本

## 在浏览器控制台查询Session过期时间

### 查询当前Session信息（包括管理员和用户）

```javascript
// 查询完整的session信息
(async () => {
  try {
    const response = await fetch('/api/auth/session/info', {
      credentials: 'include'
    });
    const data = await response.json();
    if (data.success) {
      console.log('=== Session Info ===');
      console.log('User Type:', data.session.userType);
      console.log('Admin ID:', data.session.adminId);
      console.log('User ID:', data.session.userId);
      
      if (data.session.admin) {
        console.log('\n=== Admin Session ===');
        console.log('Expires At:', data.session.admin.expiresAtLocal);
        console.log('Remaining:', data.session.admin.formatted);
        console.log('Remaining (ms):', data.session.admin.remainingMs);
        console.log('Is Expired:', data.session.admin.isExpired);
      }
      
      if (data.session.user) {
        console.log('\n=== User Session ===');
        console.log('Expires At:', data.session.user.expiresAtLocal);
        console.log('Remaining:', data.session.user.formatted);
        console.log('Remaining (ms):', data.session.user.remainingMs);
        console.log('Is Expired:', data.session.user.isExpired);
      }
      
      console.log('\n=== Cookie Info ===');
      console.log('Cookie Expires At:', data.session.cookie.expiresAtLocal);
      console.log('Cookie Remaining:', data.session.cookie.formatted);
    } else {
      console.error('Failed to get session info:', data.message);
    }
  } catch (error) {
    console.error('Error:', error);
  }
})();
```

### 仅查询管理员Session过期时间

```javascript
// 查询管理员session过期时间
(async () => {
  try {
    const response = await fetch('/api/auth/session/info', {
      credentials: 'include'
    });
    const data = await response.json();
    if (data.success && data.session.admin) {
      console.log('=== Admin Session ===');
      console.log('Expires At:', data.session.admin.expiresAtLocal);
      console.log('Remaining:', data.session.admin.formatted);
      console.log('Remaining (ms):', data.session.admin.remainingMs);
      console.log('Is Expired:', data.session.admin.isExpired);
    } else {
      console.log('No admin session found');
    }
  } catch (error) {
    console.error('Error:', error);
  }
})();
```

### 仅查询用户Session过期时间

```javascript
// 查询用户session过期时间
(async () => {
  try {
    const response = await fetch('/api/auth/session/info', {
      credentials: 'include'
    });
    const data = await response.json();
    if (data.success && data.session.user) {
      console.log('=== User Session ===');
      console.log('Expires At:', data.session.user.expiresAtLocal);
      console.log('Remaining:', data.session.user.formatted);
      console.log('Remaining (ms):', data.session.user.remainingMs);
      console.log('Is Expired:', data.session.user.isExpired);
    } else {
      console.log('No user session found');
    }
  } catch (error) {
    console.error('Error:', error);
  }
})();
```

### 实时监控Session过期时间（每10秒更新一次）

```javascript
// 实时监控session过期时间
let monitorInterval = setInterval(async () => {
  try {
    const response = await fetch('/api/auth/session/info', {
      credentials: 'include'
    });
    const data = await response.json();
    if (data.success) {
      console.clear();
      console.log('=== Session Monitor ===');
      console.log('Time:', new Date().toLocaleString());
      
      if (data.session.admin) {
        console.log('\nAdmin Session:');
        console.log('  Remaining:', data.session.admin.formatted);
        console.log('  Expires:', data.session.admin.expiresAtLocal);
        console.log('  Status:', data.session.admin.isExpired ? '❌ EXPIRED' : '✅ Active');
      }
      
      if (data.session.user) {
        console.log('\nUser Session:');
        console.log('  Remaining:', data.session.user.formatted);
        console.log('  Expires:', data.session.user.expiresAtLocal);
        console.log('  Status:', data.session.user.isExpired ? '❌ EXPIRED' : '✅ Active');
      }
    }
  } catch (error) {
    console.error('Error:', error);
  }
}, 10000); // 每10秒更新一次

// 停止监控：clearInterval(monitorInterval);
```

### 手动刷新Session（测试rolling session功能）

```javascript
// 手动刷新session时间
(async () => {
  try {
    const response = await fetch('/api/auth/session/refresh', {
      method: 'POST',
      credentials: 'include'
    });
    const data = await response.json();
    if (data.success) {
      console.log('✅ Session refreshed successfully');
      // 重新查询session信息
      const infoResponse = await fetch('/api/auth/session/info', {
        credentials: 'include'
      });
      const infoData = await infoResponse.json();
      if (infoData.success) {
        console.log('Updated session info:', infoData.session);
      }
    } else {
      console.error('Failed to refresh session:', data.message);
    }
  } catch (error) {
    console.error('Error:', error);
  }
})();
```

## 使用说明

1. **打开浏览器开发者工具**（F12 或 Cmd+Option+I）
2. **切换到Console标签**
3. **复制上面的脚本并粘贴到控制台**
4. **按Enter执行**

## 注意事项

- 这些脚本需要在已登录的页面中执行
- 如果session已过期，查询会返回401错误
- 监控脚本会持续运行，记得使用 `clearInterval(monitorInterval)` 停止

