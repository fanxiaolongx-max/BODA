/**
 * 批量导入翻译卡片数据
 * 使用方法: node scripts/import-translation-cards.js
 */

const { initDatabase, getAsync, runAsync } = require('../db/database');
const { createBlogPost, getBlogPosts } = require('../utils/blog-helper');
const { logger } = require('../utils/logger');

// 翻译卡片数据
const translationCards = [
  // 一、万能基础（出现频率 Top 1）
  // 1️⃣ 打招呼 / 礼貌
  {
    name: '你好吗？（对男）',
    chinese: '你好吗？',
    arabic: 'إزيّك؟',
    category: '打招呼/礼貌',
    excerpt: 'Izzayyak? - 对男性使用'
  },
  {
    name: '你好吗？（对女）',
    chinese: '你好吗？',
    arabic: 'إزيّك؟',
    category: '打招呼/礼貌',
    excerpt: 'Izzayyik? - 对女性使用'
  },
  {
    name: '好的/没问题',
    chinese: '好的 / 没问题 / 行',
    arabic: 'تمام',
    category: '打招呼/礼貌',
    excerpt: 'Tamam - 万能回复'
  },
  {
    name: '挺好',
    chinese: '挺好',
    arabic: 'كويس',
    category: '打招呼/礼貌',
    excerpt: 'Kwayyis - 表示状态不错'
  },
  {
    name: '谢谢',
    chinese: '谢谢',
    arabic: 'شكراً',
    category: '打招呼/礼貌',
    excerpt: 'Shokran - 基本礼貌用语'
  },
  {
    name: '不好意思/算了',
    chinese: '不好意思 / 算了 / 抱歉 / 安慰用',
    arabic: 'معلش',
    category: '打招呼/礼貌',
    excerpt: "Ma'lesh - 埃及神词，能解决一半冲突"
  },

  // 二、砍价 & 买东西（旅游必会）
  // 2️⃣ 价格相关
  {
    name: '这个多少钱？',
    chinese: '这个多少钱？',
    arabic: 'بكام ده؟',
    category: '砍价/购物',
    excerpt: 'Bekam da? - 购物必备'
  },
  {
    name: '太贵了',
    chinese: '太贵了',
    arabic: 'غالي قوي',
    category: '砍价/购物',
    excerpt: 'Ghāli awi - 砍价第一句'
  },
  {
    name: '便宜点吧',
    chinese: '便宜点吧',
    arabic: 'شوية كده',
    category: '砍价/购物',
    excerpt: 'Shwayya keda - 请求降价'
  },
  {
    name: '最低价？',
    chinese: '最低价？',
    arabic: 'آخر كلام؟',
    category: '砍价/购物',
    excerpt: 'Ākher kalām? - 最后的价格'
  },
  {
    name: '行，就这样（成交）',
    chinese: '行，就这样（成交）',
    arabic: 'ماشي، خلّص',
    category: '砍价/购物',
    excerpt: 'Māshi, khallas - 成交用语'
  },
  {
    name: '不要，谢谢',
    chinese: '不要，谢谢（比直接走文明）',
    arabic: 'لا، شكراً',
    category: '砍价/购物',
    excerpt: "La', shokran - 礼貌拒绝"
  },

  // 三、打车 / Uber / 路线（你会常用）
  // 3️⃣ 司机对话
  {
    name: '去哪？',
    chinese: '去哪？',
    arabic: 'على فين؟',
    category: '打车/路线',
    excerpt: "'Ala fēn? - 司机常用"
  },
  {
    name: '等一下',
    chinese: '等一下',
    arabic: 'استنى شوية',
    category: '打车/路线',
    excerpt: 'Istanna shwayya - 请求等待'
  },
  {
    name: '这里就行',
    chinese: '这里就行',
    arabic: 'هنا كويس',
    category: '打车/路线',
    excerpt: 'Hena kwayyis - 到达目的地'
  },
  {
    name: '在这停',
    chinese: '在这停',
    arabic: 'وقف هنا',
    category: '打车/路线',
    excerpt: 'Waff hena - 停车指令'
  },
  {
    name: '右/左',
    chinese: '右 / 左',
    arabic: 'يمين / شمال',
    category: '打车/路线',
    excerpt: 'Yamīn / Shemāl - 方向指示'
  },
  {
    name: '慢点（坐车必备）',
    chinese: '慢点（坐车必备）',
    arabic: 'بالراحة',
    category: '打车/路线',
    excerpt: 'Bel-rāḥa - 请求慢速行驶'
  },

  // 四、餐厅点餐（埃及人最喜欢你会说的）
  // 4️⃣ 吃饭
  {
    name: '给我菜单',
    chinese: '给我菜单',
    arabic: 'ممكن المنيو؟',
    category: '餐厅点餐',
    excerpt: 'Momken el-menu? - 点餐第一句'
  },
  {
    name: '我要这个（男）',
    chinese: '我要这个',
    arabic: 'عايز ده',
    category: '餐厅点餐',
    excerpt: "'Āyez da - 男性用语"
  },
  {
    name: '不要……',
    chinese: '不要……',
    arabic: 'من غير',
    category: '餐厅点餐',
    excerpt: 'Men gheir… - 例：من غير بصل（不要洋葱）'
  },
  {
    name: '买单',
    chinese: '买单',
    arabic: 'حاسب لو سمحت',
    category: '餐厅点餐',
    excerpt: 'Ḥāseb law samaḥt - 结账用语'
  },
  {
    name: '太好吃了',
    chinese: '太好吃了（他们会很开心）',
    arabic: 'حلو قوي',
    category: '餐厅点餐',
    excerpt: 'Ḥelw awi - 赞美食物'
  },

  // 五、应付搭讪 / 推销（安全感直接拉满）
  // 5️⃣ 防骚扰神句
  {
    name: '不要了，结束',
    chinese: '不要了，结束',
    arabic: 'لا، خلاص',
    category: '防骚扰',
    excerpt: "La', khalāṣ - 明确拒绝"
  },
  {
    name: '我不想要',
    chinese: '我不想要',
    arabic: 'مش عايز',
    category: '防骚扰',
    excerpt: "Mesh 'āyez - 拒绝推销"
  },
  {
    name: '请别打扰我',
    chinese: '请别打扰我',
    arabic: 'سيبني لو سمحت',
    category: '防骚扰',
    excerpt: 'Sībni law samaḥt - 礼貌拒绝'
  },
  {
    name: '我赶时间',
    chinese: '我赶时间',
    arabic: 'أنا مستعجل',
    category: '防骚扰',
    excerpt: "Ana mesta'gel - 脱身借口"
  },

  // 六、装"老埃及人"的高级口语（加分）
  {
    name: '没问题',
    chinese: '没问题',
    arabic: 'مافيش مشكلة',
    category: '高级口语',
    excerpt: 'Māfīsh moshkela - 地道表达'
  },
  {
    name: '好得很/完美',
    chinese: '好得很 / 完美',
    arabic: 'زي الفل',
    category: '高级口语',
    excerpt: 'Zay el-foll - 完美状态'
  },
  {
    name: '热死人了',
    chinese: '热死人了（共鸣王）',
    arabic: 'الدنيا حر نار',
    category: '高级口语',
    excerpt: 'El-donya ḥorr nār - 天气太热'
  },
  {
    name: '谢谢你（非常有人情味）',
    chinese: '谢谢你（非常有人情味）',
    arabic: 'ربنا يخليك',
    category: '高级口语',
    excerpt: 'Rabbena ykhalleek - 非常有人情味的感谢'
  }
];

async function importTranslationCards() {
  try {
    await initDatabase();
    logger.info('开始导入翻译卡片数据...');

    // 检查是否存在translation API
    const translationApi = await getAsync(`
      SELECT id, name, path, response_content
      FROM custom_apis
      WHERE name LIKE '%translation%' OR name LIKE '%翻译%'
      LIMIT 1
    `);

    if (!translationApi) {
      logger.error('未找到翻译卡片API，请先在管理界面创建translation类型的API');
      process.exit(1);
    }

    const apiName = translationApi.name;
    logger.info(`使用API: ${apiName}`);

    let successCount = 0;
    let skipCount = 0;
    let errorCount = 0;

    // 获取所有已存在的翻译卡片文章
    const existingPosts = await getBlogPosts({ 
      publishedOnly: false,
      category: apiName 
    });

    for (const card of translationCards) {
      try {
        // 检查是否已存在相同的中文和阿拉伯文组合
        const exists = existingPosts.some(post => {
          const originalData = post._originalData || {};
          return originalData.chinese === card.chinese && 
                 originalData.arabic === card.arabic;
        });

        if (exists) {
          logger.info(`跳过已存在的卡片: ${card.name}`);
          skipCount++;
          continue;
        }

        // 创建文章
        const postData = {
          name: card.name,
          apiName: apiName,
          excerpt: card.excerpt || '',
          published: true,
          _specialType: 'translation',
          _specialData: {
            chinese: card.chinese,
            arabic: card.arabic,
            category: card.category
          }
        };

        await createBlogPost(postData);
        successCount++;
        logger.info(`✓ 已创建: ${card.name}`);
      } catch (error) {
        errorCount++;
        logger.error(`✗ 创建失败: ${card.name}`, { error: error.message });
      }
    }

    logger.info('导入完成！', {
      success: successCount,
      skipped: skipCount,
      errors: errorCount,
      total: translationCards.length
    });

    process.exit(0);
  } catch (error) {
    logger.error('导入失败', { error: error.message, stack: error.stack });
    process.exit(1);
  }
}

// 运行导入
if (require.main === module) {
  importTranslationCards();
}

module.exports = { importTranslationCards, translationCards };
