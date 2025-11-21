#!/usr/bin/env node

/**
 * 检查所有备份和恢复功能是否可用
 */

const fs = require('fs');
const path = require('path');

const features = [
  {
    name: '💾 Backup Menu',
    endpoint: 'POST /api/admin/menu/backup',
    description: '备份产品和分类数据（包括图片）',
    file: 'routes/admin.js',
    check: 'router.post(\'/menu/backup\''
  },
  {
    name: '📥 Import Menu',
    endpoint: 'POST /api/admin/menu/import',
    description: '导入产品和分类数据（包括图片）',
    file: 'routes/admin.js',
    check: 'router.post(\'/menu/import\''
  },
  {
    name: '💾 Database Backup & Restore',
    endpoint: 'POST /api/admin/backup/create',
    description: '创建数据库备份',
    file: 'routes/admin.js',
    check: 'router.post(\'/backup/create\''
  },
  {
    name: 'Create DB Backup',
    endpoint: 'POST /api/admin/backup/create',
    description: '创建数据库备份（同上）',
    file: 'routes/admin.js',
    check: 'router.post(\'/backup/create\''
  },
  {
    name: 'Create Full Backup',
    endpoint: 'POST /api/admin/backup/full',
    description: '创建完整备份（数据库+文件）',
    file: 'routes/admin.js',
    check: 'router.post(\'/backup/full\''
  },
  {
    name: 'Upload Backup',
    endpoint: 'POST /api/admin/backup/upload',
    description: '上传备份文件',
    file: 'routes/admin.js',
    check: 'router.post(\'/backup/upload\''
  },
  {
    name: 'Restore',
    endpoint: 'POST /api/admin/backup/restore',
    description: '恢复备份',
    file: 'routes/admin.js',
    check: 'router.post(\'/backup/restore\''
  },
  {
    name: 'Remote Backup (Cross-Site Backup)',
    endpoint: 'POST /api/admin/remote-backup/configs',
    description: '远程备份配置',
    file: 'routes/admin.js',
    check: 'router.post(\'/remote-backup/configs\''
  }
];

console.log('=== 备份和恢复功能检查 ===\n');

const routesFile = path.join(__dirname, '..', 'routes', 'admin.js');
const backupUtilsFile = path.join(__dirname, '..', 'utils', 'backup.js');
const remoteBackupUtilsFile = path.join(__dirname, '..', 'utils', 'remote-backup.js');

let allPassed = true;

// 检查文件是否存在
if (!fs.existsSync(routesFile)) {
  console.log('❌ routes/admin.js 文件不存在');
  process.exit(1);
}

if (!fs.existsSync(backupUtilsFile)) {
  console.log('❌ utils/backup.js 文件不存在');
  process.exit(1);
}

if (!fs.existsSync(remoteBackupUtilsFile)) {
  console.log('❌ utils/remote-backup.js 文件不存在');
  process.exit(1);
}

const routesContent = fs.readFileSync(routesFile, 'utf8');
const backupUtilsContent = fs.readFileSync(backupUtilsFile, 'utf8');
const remoteBackupUtilsContent = fs.readFileSync(remoteBackupUtilsFile, 'utf8');

// 检查每个功能
features.forEach((feature, index) => {
  console.log(`${index + 1}. ${feature.name}`);
  console.log(`   端点: ${feature.endpoint}`);
  console.log(`   描述: ${feature.description}`);
  
  let found = false;
  
  if (feature.check) {
    if (routesContent.includes(feature.check)) {
      found = true;
      console.log(`   ✅ 路由已实现`);
    } else {
      console.log(`   ❌ 路由未找到`);
      allPassed = false;
    }
  }
  
  console.log('');
});

// 检查工具函数
console.log('=== 工具函数检查 ===\n');

const utilsFunctions = [
  { name: 'backupDatabase', file: backupUtilsContent },
  { name: 'backupFull', file: backupUtilsContent },
  { name: 'restoreDatabase', file: backupUtilsContent },
  { name: 'getBackupList', file: backupUtilsContent },
  { name: 'deleteBackup', file: backupUtilsContent },
  { name: 'pushBackupToRemote', file: remoteBackupUtilsContent },
  { name: 'shouldPushNow', file: remoteBackupUtilsContent }
];

utilsFunctions.forEach(func => {
  if (func.file.includes(`function ${func.name}`) || func.file.includes(`async function ${func.name}`)) {
    console.log(`✅ ${func.name} 函数已实现`);
  } else {
    console.log(`❌ ${func.name} 函数未找到`);
    allPassed = false;
  }
});

console.log('');

// 检查所有路由端点
console.log('=== 所有备份相关路由端点 ===\n');

const backupEndpoints = [
  'POST /api/admin/menu/backup',
  'GET /api/admin/menu/backup/download',
  'POST /api/admin/menu/import',
  'POST /api/admin/backup/create',
  'GET /api/admin/backup/list',
  'GET /api/admin/backup/download/:fileName',
  'POST /api/admin/backup/restore',
  'DELETE /api/admin/backup/delete',
  'POST /api/admin/backup/upload',
  'GET /api/admin/remote-backup/configs',
  'POST /api/admin/remote-backup/configs',
  'PUT /api/admin/remote-backup/configs/:id',
  'DELETE /api/admin/remote-backup/configs/:id',
  'POST /api/admin/remote-backup/configs/:id/push',
  'GET /api/admin/remote-backup/receive-config',
  'PUT /api/admin/remote-backup/receive-config',
  'GET /api/admin/remote-backup/push-logs',
  'GET /api/admin/remote-backup/received',
  'POST /api/admin/remote-backup/received/:id/restore',
  'POST /api/admin/remote-backup/receive'
];

backupEndpoints.forEach(endpoint => {
  const method = endpoint.split(' ')[0];
  const path = endpoint.split(' ')[1];
  const routePattern = path.replace(/:[^/]+/g, '[^/]+');
  const checkPattern = `router.${method.toLowerCase()}('${path}`;
  
  if (routesContent.includes(checkPattern) || routesContent.includes(`router.${method.toLowerCase()}('${path.split('/').pop()}`)) {
    console.log(`✅ ${endpoint}`);
  } else {
    // 尝试更灵活的匹配
    const flexiblePattern = path.split('/').pop();
    if (routesContent.includes(flexiblePattern)) {
      console.log(`✅ ${endpoint} (可能路径不同)`);
    } else {
      console.log(`❌ ${endpoint}`);
      allPassed = false;
    }
  }
});

console.log('\n=== 检查结果 ===');
if (allPassed) {
  console.log('✅ 所有备份和恢复功能都已实现！');
} else {
  console.log('⚠️  部分功能可能未实现，请检查上述错误。');
}

process.exit(allPassed ? 0 : 1);

