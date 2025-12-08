const { allAsync, getAsync, runAsync, waitForDbReady } = require('../db/database');

// API路径映射
const API_PATHS = {
  'second-hand': '/second-hand',
  'translation': '/translation',
  'hot-activity': '/hot-activity',
  'rentals': '/rentals',
  'hot-spots': '/hot-spots',
  'locations': '/locations',
  'menu-links': '/menu-links'
};

/**
 * 生成二手市场测试数据
 */
function generateSecondHandData(existingData) {
  const baseData = existingData && existingData.length > 0 ? existingData : [];
  const maxId = baseData.length > 0 ? Math.max(...baseData.map(item => item.id || 0)) : 0;
  const newItems = [
    {
      id: maxId + 1,
      title: '二手iPhone 13 Pro Max 256GB',
      price: '4500',
      category: '电子产品',
      description: '99新，使用半年，无任何问题，原装充电器',
      image: '/page/component/resources/pic/2.jpg',
      contact: '微信：secondhand025'
    },
    {
      id: maxId + 2,
      title: '二手MacBook Pro 14寸 M1',
      price: '8500',
      category: '电子产品',
      description: '2021款，16GB内存，512GB存储，外观完好',
      image: '/page/component/resources/pic/3.jpg',
      contact: '微信：secondhand026'
    },
    {
      id: maxId + 3,
      title: '二手相机 佳能5D Mark IV',
      price: '12000',
      category: '电子产品',
      description: '专业单反相机，快门次数3万，配24-70镜头',
      image: '/page/component/resources/pic/4.jpg',
      contact: '微信：secondhand027'
    },
    {
      id: maxId + 4,
      title: '二手沙发 三人座',
      price: '800',
      category: '家具',
      description: '宜家沙发，使用2年，保养良好，可送货',
      image: '/page/component/resources/pic/5.jpg',
      contact: '微信：secondhand028'
    },
    {
      id: maxId + 5,
      title: '二手自行车 山地车',
      price: '600',
      category: '交通工具',
      description: '美利达山地车，27速，9成新',
      image: '/page/component/resources/pic/6.jpg',
      contact: '微信：secondhand029'
    },
    {
      id: maxId + 6,
      title: '二手洗衣机 海尔8公斤',
      price: '500',
      category: '家电',
      description: '全自动洗衣机，使用3年，功能正常',
      image: '/page/component/resources/pic/7.jpg',
      contact: '微信：secondhand030'
    },
    {
      id: maxId + 7,
      title: '二手书桌 实木',
      price: '300',
      category: '家具',
      description: '1.2米实木书桌，带抽屉，8成新',
      image: '/page/component/resources/pic/8.jpg',
      contact: '微信：secondhand031'
    },
    {
      id: maxId + 8,
      title: '二手冰箱 双开门',
      price: '1200',
      category: '家电',
      description: '海尔双开门冰箱，使用2年，制冷效果好',
      image: '/page/component/resources/pic/9.jpg',
      contact: '微信：secondhand032'
    }
  ];
  
  return [...baseData, ...newItems];
}

/**
 * 生成翻译卡片测试数据
 */
function generateTranslationData(existingData) {
  const baseData = existingData && existingData.length > 0 ? existingData : [];
  const maxId = baseData.length > 0 ? Math.max(...baseData.map(item => item.id || 0)) : 0;
  const newCards = [
    {
      id: maxId + 1,
      chinese: '再见',
      arabic: 'مع السلامة',
      category: '问候'
    },
    {
      id: maxId + 2,
      chinese: '对不起',
      arabic: 'آسف',
      category: '礼貌'
    },
    {
      id: maxId + 3,
      chinese: '不客气',
      arabic: 'عفوا',
      category: '礼貌'
    },
    {
      id: maxId + 4,
      chinese: '多少钱？',
      arabic: 'كم السعر؟',
      category: '购物'
    },
    {
      id: maxId + 5,
      chinese: '我要这个',
      arabic: 'أريد هذا',
      category: '购物'
    },
    {
      id: maxId + 6,
      chinese: '好吃',
      arabic: 'لذيذ',
      category: '美食'
    },
    {
      id: maxId + 7,
      chinese: '医院在哪里？',
      arabic: 'أين المستشفى؟',
      category: '问路'
    },
    {
      id: maxId + 8,
      chinese: '谢谢你的帮助',
      arabic: 'شكرا لمساعدتك',
      category: '礼貌'
    }
  ];
  
  return [...baseData, ...newCards];
}

/**
 * 生成热门活动测试数据
 */
function generateHotActivityData(existingData) {
  const baseData = existingData && existingData.length > 0 ? existingData : [];
  const maxId = baseData.length > 0 ? Math.max(...baseData.map(item => item.id || 0)) : 0;
  const newActivities = [
    {
      id: maxId + 1,
      title: '开罗华人中秋晚会',
      description: '2024年9月15日，开罗市中心举办',
      image: 'https://picsum.photos/seed/ch_rest2/400/300',
      category: '聚会'
    },
    {
      id: maxId + 2,
      title: '开罗华人足球赛',
      description: '2024年10月1日，开罗体育场',
      image: 'https://picsum.photos/seed/ch_rest3/400/300',
      category: '运动'
    },
    {
      id: maxId + 3,
      title: '开罗华人美食节',
      description: '2024年11月10日，开罗展览中心',
      image: 'https://picsum.photos/seed/ch_rest4/400/300',
      category: '美食'
    },
    {
      id: maxId + 4,
      title: '开罗华人文化节',
      description: '2024年12月25日，开罗文化中心',
      image: 'https://picsum.photos/seed/ch_rest5/400/300',
      category: '文化'
    },
    {
      id: maxId + 5,
      title: '开罗华人摄影展',
      description: '2025年1月20日，开罗美术馆',
      image: 'https://picsum.photos/seed/ch_rest6/400/300',
      category: '艺术'
    },
    {
      id: maxId + 6,
      title: '开罗华人音乐会',
      description: '2025年2月14日，开罗音乐厅',
      image: 'https://picsum.photos/seed/ch_rest7/400/300',
      category: '音乐'
    },
    {
      id: maxId + 7,
      title: '开罗华人读书会',
      description: '2025年3月1日，开罗图书馆',
      image: 'https://picsum.photos/seed/ch_rest8/400/300',
      category: '文化'
    },
    {
      id: maxId + 8,
      title: '开罗华人创业论坛',
      description: '2025年4月10日，开罗会议中心',
      image: 'https://picsum.photos/seed/ch_rest9/400/300',
      category: '商务'
    }
  ];
  
  return [...baseData, ...newActivities];
}

/**
 * 生成租房酒店测试数据
 */
function generateRentalsData(existingData) {
  const baseData = existingData && existingData.length > 0 ? existingData : [];
  const maxId = baseData.length > 0 ? Math.max(...baseData.map(item => item.id || 0)) : 0;
  const newRentals = [
    {
      id: maxId + 1,
      title: '开罗市中心精装两居室',
      address: '开罗市中心，近地铁站',
      price: '4000',
      type: '整租',
      rooms: '2',
      area: '90',
      contact: '微信：rental006',
      latitude: 30.0444,
      longitude: 31.2357,
      image: '/page/component/resources/pic/2.jpg',
      category: '开罗市中心'
    },
    {
      id: maxId + 2,
      title: '开罗新城区三居室',
      address: '开罗新城区，环境优美',
      price: '5000',
      type: '整租',
      rooms: '3',
      area: '120',
      contact: '微信：rental007',
      latitude: 30.0544,
      longitude: 31.2457,
      image: '/page/component/resources/pic/3.jpg',
      category: '开罗新城区'
    },
    {
      id: maxId + 3,
      title: '开罗商务酒店标准间',
      address: '开罗商务区，交通便利',
      price: '300',
      type: '酒店',
      rooms: '1',
      area: '25',
      contact: '微信：rental008',
      latitude: 30.0644,
      longitude: 31.2557,
      image: '/page/component/resources/pic/4.jpg',
      category: '开罗商务区'
    },
    {
      id: maxId + 4,
      title: '开罗一居室公寓',
      address: '开罗市中心，精装修',
      price: '2800',
      type: '整租',
      rooms: '1',
      area: '50',
      contact: '微信：rental009',
      latitude: 30.0744,
      longitude: 31.2657,
      image: '/page/component/resources/pic/5.jpg',
      category: '开罗市中心'
    },
    {
      id: maxId + 5,
      title: '开罗豪华酒店套房',
      address: '开罗市中心，五星级',
      price: '800',
      type: '酒店',
      rooms: '1',
      area: '60',
      contact: '微信：rental010',
      latitude: 30.0844,
      longitude: 31.2757,
      image: '/page/component/resources/pic/6.jpg',
      category: '开罗市中心'
    },
    {
      id: maxId + 6,
      title: '开罗两居室 学区房',
      address: '开罗教育区，近学校',
      price: '4500',
      type: '整租',
      rooms: '2',
      area: '85',
      contact: '微信：rental011',
      latitude: 30.0944,
      longitude: 31.2857,
      image: '/page/component/resources/pic/7.jpg',
      category: '开罗教育区'
    },
    {
      id: maxId + 7,
      title: '开罗民宿 温馨小院',
      address: '开罗老城区，特色民宿',
      price: '250',
      type: '酒店',
      rooms: '1',
      area: '35',
      contact: '微信：rental012',
      latitude: 30.1044,
      longitude: 31.2957,
      image: '/page/component/resources/pic/8.jpg',
      category: '开罗老城区'
    },
    {
      id: maxId + 8,
      title: '开罗四居室 别墅',
      address: '开罗郊区，独栋别墅',
      price: '8000',
      type: '整租',
      rooms: '4',
      area: '200',
      contact: '微信：rental013',
      latitude: 30.1144,
      longitude: 31.3057,
      image: '/page/component/resources/pic/9.jpg',
      category: '开罗郊区'
    }
  ];
  
  return [...baseData, ...newRentals];
}

/**
 * 生成热门打卡测试数据
 */
function generateHotSpotsData(existingData) {
  const baseData = existingData && existingData.length > 0 ? existingData : [];
  const maxId = baseData.length > 0 ? Math.max(...baseData.map(item => item.id || 0)) : 0;
  const newSpots = [
    {
      id: maxId + 1,
      name: '开罗博物馆',
      description: '世界著名的古埃及文物博物馆',
      image: '/page/component/resources/pic/2.jpg',
      latitude: 30.0478,
      longitude: 31.2336,
      category: '博物馆'
    },
    {
      id: maxId + 2,
      name: '尼罗河游船',
      description: '欣赏尼罗河两岸美景',
      image: '/page/component/resources/pic/3.jpg',
      latitude: 30.0444,
      longitude: 31.2357,
      category: '景点'
    },
    {
      id: maxId + 3,
      name: '哈利利市场',
      description: '开罗最著名的传统市场',
      image: '/page/component/resources/pic/4.jpg',
      latitude: 30.0451,
      longitude: 31.2622,
      category: '购物'
    },
    {
      id: maxId + 4,
      name: '萨拉丁城堡',
      description: '中世纪伊斯兰建筑',
      image: '/page/component/resources/pic/5.jpg',
      latitude: 30.0292,
      longitude: 31.2619,
      category: '历史'
    },
    {
      id: maxId + 5,
      name: '开罗塔',
      description: '开罗地标建筑，登高望远',
      image: '/page/component/resources/pic/6.jpg',
      latitude: 30.0458,
      longitude: 31.2244,
      category: '景点'
    },
    {
      id: maxId + 6,
      name: '爱资哈尔清真寺',
      description: '开罗最古老的清真寺之一',
      image: '/page/component/resources/pic/7.jpg',
      latitude: 30.0451,
      longitude: 31.2622,
      category: '宗教'
    },
    {
      id: maxId + 7,
      name: '尼罗河广场',
      description: '开罗市中心广场，休闲好去处',
      image: '/page/component/resources/pic/8.jpg',
      latitude: 30.0444,
      longitude: 31.2357,
      category: '广场'
    },
    {
      id: maxId + 8,
      name: '开罗歌剧院',
      description: '开罗文化中心，欣赏演出',
      image: '/page/component/resources/pic/9.jpg',
      latitude: 30.0431,
      longitude: 31.2236,
      category: '文化'
    }
  ];
  
  return [...baseData, ...newSpots];
}

/**
 * 生成常用导航测试数据
 */
function generateLocationsData(existingData) {
  const baseData = existingData && existingData.length > 0 ? existingData : [];
  const maxId = baseData.length > 0 ? Math.max(...baseData.map(item => item.id || 0)) : 0;
  const newLocations = [
    {
      id: maxId + 1,
      name: '开罗中央火车站',
      address: '开罗市中心',
      latitude: 30.0626,
      longitude: 31.2497,
      image: '/page/component/resources/pic/2.jpg',
      category: '火车站'
    },
    {
      id: maxId + 2,
      name: '开罗大学',
      address: '开罗吉萨区',
      latitude: 30.0275,
      longitude: 31.2100,
      image: '/page/component/resources/pic/3.jpg',
      category: '学校'
    },
    {
      id: maxId + 3,
      name: '开罗医院',
      address: '开罗市中心',
      latitude: 30.0444,
      longitude: 31.2357,
      image: '/page/component/resources/pic/4.jpg',
      category: '医院'
    },
    {
      id: maxId + 4,
      name: '开罗购物中心',
      address: '开罗新城区',
      latitude: 30.0544,
      longitude: 31.2457,
      image: '/page/component/resources/pic/5.jpg',
      category: '购物'
    },
    {
      id: maxId + 5,
      name: '开罗图书馆',
      address: '开罗市中心',
      latitude: 30.0444,
      longitude: 31.2357,
      image: '/page/component/resources/pic/6.jpg',
      category: '图书馆'
    },
    {
      id: maxId + 6,
      name: '开罗警察局',
      address: '开罗市中心',
      latitude: 30.0444,
      longitude: 31.2357,
      image: '/page/component/resources/pic/7.jpg',
      category: '政府'
    },
    {
      id: maxId + 7,
      name: '开罗邮局',
      address: '开罗市中心',
      latitude: 30.0444,
      longitude: 31.2357,
      image: '/page/component/resources/pic/8.jpg',
      category: '邮局'
    },
    {
      id: maxId + 8,
      name: '开罗银行',
      address: '开罗金融区',
      latitude: 30.0444,
      longitude: 31.2357,
      image: '/page/component/resources/pic/9.jpg',
      category: '银行'
    }
  ];
  
  return [...baseData, ...newLocations];
}

/**
 * 生成寻味中国测试数据
 */
function generateMenuLinksData(existingData) {
  const baseData = existingData && existingData.length > 0 ? existingData : [];
  const maxId = baseData.length > 0 ? Math.max(...baseData.map(item => item.id || 0)) : 0;
  const newLinks = [
    {
      id: maxId + 1,
      name: '🍜 川味小面',
      url: 'https://boda-0mqtrq.fly.dev/',
      title: '川味小面',
      image: 'https://picsum.photos/seed/ch_rest2/400/300',
      category: '中餐厅'
    },
    {
      id: maxId + 2,
      name: '🥟 饺子馆',
      url: 'https://boda-0mqtrq.fly.dev/',
      title: '饺子馆',
      image: 'https://picsum.photos/seed/ch_rest3/400/300',
      category: '中餐厅'
    },
    {
      id: maxId + 3,
      name: '🍲 火锅店',
      url: 'https://boda-0mqtrq.fly.dev/',
      title: '火锅店',
      image: 'https://picsum.photos/seed/ch_rest4/400/300',
      category: '中餐厅'
    },
    {
      id: maxId + 4,
      name: '🍱 日式料理',
      url: 'https://boda-0mqtrq.fly.dev/',
      title: '日式料理',
      image: 'https://picsum.photos/seed/ch_rest5/400/300',
      category: '日式餐厅'
    },
    {
      id: maxId + 5,
      name: '🍕 披萨店',
      url: 'https://boda-0mqtrq.fly.dev/',
      title: '披萨店',
      image: 'https://picsum.photos/seed/ch_rest6/400/300',
      category: '西餐厅'
    },
    {
      id: maxId + 6,
      name: '🍔 汉堡店',
      url: 'https://boda-0mqtrq.fly.dev/',
      title: '汉堡店',
      image: 'https://picsum.photos/seed/ch_rest7/400/300',
      category: '快餐店'
    },
    {
      id: maxId + 7,
      name: '🥗 沙拉店',
      url: 'https://boda-0mqtrq.fly.dev/',
      title: '沙拉店',
      image: 'https://picsum.photos/seed/ch_rest8/400/300',
      category: '健康餐厅'
    },
    {
      id: maxId + 8,
      name: '🍰 甜品店',
      url: 'https://boda-0mqtrq.fly.dev/',
      title: '甜品店',
      image: 'https://picsum.photos/seed/ch_rest9/400/300',
      category: '甜品店'
    }
  ];
  
  return [...baseData, ...newLinks];
}

/**
 * 主函数：生成并更新测试数据
 */
async function generateTestData() {
  await waitForDbReady();
  
  console.log('开始生成测试数据...\n');
  
  const generators = {
    '/second-hand': generateSecondHandData,
    '/translation': generateTranslationData,
    '/hot-activity': generateHotActivityData,
    '/rentals': generateRentalsData,
    '/hot-spots': generateHotSpotsData,
    '/locations': generateLocationsData,
    '/menu-links': generateMenuLinksData
  };
  
  for (const [key, path] of Object.entries(API_PATHS)) {
    try {
      console.log(`处理 ${key} (${path})...`);
      
      // 查询现有API
      const api = await getAsync(
        'SELECT id, name, response_content FROM custom_apis WHERE path = ?',
        [path]
      );
      
      if (!api) {
        console.log(`  ⚠️  API ${path} 不存在，跳过\n`);
        continue;
      }
      
      // 解析现有数据
      let existingData = [];
      try {
        const parsed = JSON.parse(api.response_content);
        if (Array.isArray(parsed)) {
          existingData = parsed;
        } else if (parsed && Array.isArray(parsed.data)) {
          existingData = parsed.data;
        }
      } catch (e) {
        console.log(`  ⚠️  无法解析现有数据，将创建新数据`);
      }
      
      // 生成新数据
      const generator = generators[path];
      if (!generator) {
        console.log(`  ⚠️  未找到生成器，跳过\n`);
        continue;
      }
      
      const newData = generator(existingData);
      
      // 更新数据库
      const responseContent = JSON.stringify(newData);
      await runAsync(
        'UPDATE custom_apis SET response_content = ?, updated_at = datetime("now", "localtime") WHERE id = ?',
        [responseContent, api.id]
      );
      
      console.log(`  ✅ 已更新 ${api.name}，共 ${newData.length} 条数据（原有 ${existingData.length} 条，新增 ${newData.length - existingData.length} 条）\n`);
      
    } catch (error) {
      console.error(`  ❌ 处理 ${key} 时出错:`, error.message);
      console.error(`  ${error.stack}\n`);
    }
  }
  
  console.log('测试数据生成完成！');
}

// 如果直接运行此脚本
if (require.main === module) {
  generateTestData()
    .then(() => {
      console.log('\n完成');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n失败:', error);
      process.exit(1);
    });
}

module.exports = { generateTestData };

