// 数据库迁移脚本 - 为orders表添加Stripe支付相关字段
const { allAsync, runAsync } = require('./database');
const { logger } = require('../utils/logger');

async function migrateStripePayment() {
  logger.info('开始迁移orders表，添加Stripe支付字段...');
  
  try {
    // 检查字段是否已存在
    const tableInfo = await allAsync("PRAGMA table_info(orders)");
    const columns = tableInfo.map(col => col.name);
    
    // 添加支付方式字段
    if (!columns.includes('payment_method')) {
      logger.info('添加 payment_method 字段...');
      await runAsync('ALTER TABLE orders ADD COLUMN payment_method TEXT DEFAULT NULL');
      logger.info('✅ payment_method 字段添加成功');
    } else {
      logger.info('payment_method 字段已存在，跳过');
    }
    
    // 添加 Stripe Payment Intent ID
    if (!columns.includes('stripe_payment_intent_id')) {
      logger.info('添加 stripe_payment_intent_id 字段...');
      await runAsync('ALTER TABLE orders ADD COLUMN stripe_payment_intent_id TEXT DEFAULT NULL');
      logger.info('✅ stripe_payment_intent_id 字段添加成功');
    } else {
      logger.info('stripe_payment_intent_id 字段已存在，跳过');
    }
    
    // 添加 Stripe Session ID（预留，用于未来扩展）
    if (!columns.includes('stripe_session_id')) {
      logger.info('添加 stripe_session_id 字段...');
      await runAsync('ALTER TABLE orders ADD COLUMN stripe_session_id TEXT DEFAULT NULL');
      logger.info('✅ stripe_session_id 字段添加成功');
    } else {
      logger.info('stripe_session_id 字段已存在，跳过');
    }
    
    logger.info('✅ orders表Stripe支付字段迁移完成！');
    
  } catch (error) {
    logger.error('❌ 迁移失败', { error: error.message, stack: error.stack });
    throw error;
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  migrateStripePayment()
    .then(() => {
      console.log('迁移成功');
      process.exit(0);
    })
    .catch((error) => {
      console.error('迁移失败:', error);
      process.exit(1);
    });
}

module.exports = { migrateStripePayment };

