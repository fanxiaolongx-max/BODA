// 打印工具模块 - 支持 QZ Tray 和 WebPrint 静默打印

let qzInitialized = false;
let defaultPrinter = null;
let qzCertificate = null;
let qzPrivateKey = null;
let qzPrivateKeyCrypto = null; // Web Crypto API 格式的私钥

// 加载证书和私钥
async function loadQZCerts() {
  try {
    // 如果已经加载过，直接返回
    if (qzCertificate && qzPrivateKey) {
      return { certificate: qzCertificate, privateKey: qzPrivateKey };
    }
    
    // 优先从 API 获取证书（支持数据库存储，兼容 fly.io）
    try {
      const apiResponse = await fetch('/api/public/qz-certificates');
      if (apiResponse.ok) {
        const data = await apiResponse.json();
        if (data.success && data.certificate && data.privateKey) {
          qzCertificate = data.certificate;
          qzPrivateKey = data.privateKey;
          console.log('✅ 从API加载QZ证书成功（来源：' + data.source + '）');
        }
      }
    } catch (apiError) {
      console.warn('从API加载证书失败，尝试从文件系统加载:', apiError);
    }
    
    // 如果 API 加载失败，回退到文件系统（向后兼容）
    if (!qzCertificate || !qzPrivateKey) {
      // 从服务器加载证书
      const certResponse = await fetch('/digital-certificate.txt');
      if (!certResponse.ok) {
        throw new Error('无法加载证书文件');
      }
      qzCertificate = await certResponse.text();
      
      // 从服务器加载私钥
      const keyResponse = await fetch('/private-key.pem');
      if (!keyResponse.ok) {
        throw new Error('无法加载私钥文件');
      }
      qzPrivateKey = await keyResponse.text();
      console.log('✅ 从文件系统加载QZ证书成功');
    }
    
    // 使用 Web Crypto API 导入私钥用于签名
    try {
      // 解析 PEM 格式的私钥（支持两种格式）
      let pemContents = '';
      let keyFormat = 'pkcs8'; // 默认格式
      
      if (qzPrivateKey.includes('-----BEGIN PRIVATE KEY-----')) {
        // PKCS#8 格式
        pemContents = qzPrivateKey
          .replace('-----BEGIN PRIVATE KEY-----', '')
          .replace('-----END PRIVATE KEY-----', '')
          .replace(/\s/g, '');
        keyFormat = 'pkcs8';
      } else if (qzPrivateKey.includes('-----BEGIN RSA PRIVATE KEY-----')) {
        // PKCS#1 格式（需要转换）
        pemContents = qzPrivateKey
          .replace('-----BEGIN RSA PRIVATE KEY-----', '')
          .replace('-----END RSA PRIVATE KEY-----', '')
          .replace(/\s/g, '');
        keyFormat = 'pkcs1';
        console.warn('检测到 PKCS#1 格式私钥，Web Crypto API 不支持，将尝试其他方法');
        // Web Crypto API 不支持 PKCS#1，需要转换或使用其他库
        // 这里先尝试作为 PKCS#8 处理（可能会失败）
      } else {
        throw new Error('无法识别的私钥格式');
      }
      
      // 转换为 ArrayBuffer
      const binaryDer = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));
      
      // 导入私钥
      // 注意：Web Crypto API 要求 RSASSA-PKCS1-v1_5 必须指定 hash 参数
      // 即使 QZ Tray 传入的是哈希值，我们仍然需要在导入时指定 hash
      // 然后在签名时根据实际情况处理（可能需要重新导入不同配置的私钥）
      if (keyFormat === 'pkcs8') {
        // 首先尝试导入带 hash 的私钥（用于签名原始数据）
        qzPrivateKeyCrypto = await crypto.subtle.importKey(
          'pkcs8',
          binaryDer.buffer,
          {
            name: 'RSASSA-PKCS1-v1_5',
            hash: 'SHA-256' // Web Crypto API 要求必须指定 hash
          },
          false,
          ['sign']
        );
        console.log('✅ QZ Tray 证书和私钥已加载（PKCS#8 格式，SHA-256）');
      } else {
        // PKCS#1 格式需要转换，这里先标记为未加载
        console.warn('PKCS#1 格式私钥需要转换，当前使用 Web Crypto API 可能无法签名');
        qzPrivateKeyCrypto = null;
      }
    } catch (cryptoError) {
      console.warn('无法导入私钥到 Web Crypto API:', cryptoError);
      console.warn('提示：如果私钥是 PKCS#1 格式，需要转换为 PKCS#8 格式');
      qzPrivateKeyCrypto = null;
    }
    
    return { certificate: qzCertificate, privateKey: qzPrivateKey };
  } catch (error) {
    console.error('加载 QZ Tray 证书失败:', error);
    return null;
  }
}

// SHA256 哈希函数（使用 Web Crypto API）
async function sha256Hash(data) {
  try {
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);
    const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
  } catch (error) {
    console.error('SHA256 哈希失败:', error);
    throw error;
  }
}

// 使用私钥签名数据
// 注意：QZ Tray 的签名流程：
// 1. QZ Tray 先调用 setSha256Type 对数据进行哈希，得到哈希值（用于验证）
// 2. 然后将原始数据传递给 setSignaturePromise 返回的签名函数
// 3. 签名函数需要对原始数据进行签名（Web Crypto API 会自动进行哈希）
async function signData(dataToSign) {
  try {
    if (!qzPrivateKeyCrypto) {
      // 如果 Web Crypto API 不可用，尝试重新加载私钥
      await loadQZCerts();
      if (!qzPrivateKeyCrypto) {
        throw new Error('私钥未加载或 Web Crypto API 不可用');
      }
    }
    
    // 准备数据缓冲区
    // QZ Tray 传入的应该是原始数据（字符串），而不是哈希值
    let dataBuffer;
    
    if (typeof dataToSign === 'string') {
      // 将字符串转换为 Uint8Array
      const encoder = new TextEncoder();
      dataBuffer = encoder.encode(dataToSign);
    } else if (dataToSign instanceof Uint8Array) {
      dataBuffer = dataToSign;
    } else if (dataToSign instanceof ArrayBuffer) {
      dataBuffer = new Uint8Array(dataToSign);
    } else {
      // 其他类型，尝试转换为字符串
      dataBuffer = new TextEncoder().encode(String(dataToSign));
    }
    
    // 使用私钥签名（私钥已配置为自动进行 SHA-256 哈希）
    // Web Crypto API 会自动对数据进行 SHA-256 哈希，然后签名
    const signature = await crypto.subtle.sign(
      {
        name: 'RSASSA-PKCS1-v1_5',
        hash: 'SHA-256' // 自动对数据进行 SHA-256 哈希，然后签名
      },
      qzPrivateKeyCrypto,
      dataBuffer
    );
    
    // 转换为 Base64 字符串
    const signatureArray = Array.from(new Uint8Array(signature));
    const signatureBase64 = btoa(String.fromCharCode(...signatureArray));
    
    console.log('✅ 数据签名成功');
    return signatureBase64;
  } catch (error) {
    console.error('签名数据失败:', error);
    throw error;
  }
}

// 初始化 QZ Tray 连接
async function initQZTray() {
  if (qzInitialized) return true;
  
  try {
    // 检查 QZ Tray 是否可用
    if (typeof qz === 'undefined') {
      console.log('QZ Tray not available');
      return false;
    }
    
    // 加载证书和私钥
    const certs = await loadQZCerts();
    if (!certs) {
      console.warn('无法加载证书，将尝试无证书连接（可能需要确认对话框）');
    }
    
    // 配置 Promise 类型
    qz.api.setPromiseType(function(resolver) { 
      return new Promise(resolver); 
    });
    
    // 配置 SHA256 哈希函数
    qz.api.setSha256Type(async function(data) {
      try {
        return await sha256Hash(data);
      } catch (error) {
        console.error('SHA256 哈希失败:', error);
        throw error;
      }
    });
    
    // 配置证书处理器（使用 qz.security 命名空间）
    if (certs && certs.certificate) {
      qz.security.setCertificatePromise(function(resolve, reject) {
        try {
          resolve(certs.certificate);
        } catch (error) {
          reject(error);
        }
      });
      console.log('✅ 证书处理器已配置');
    }
    
    // 配置签名处理器（使用 qz.security 命名空间）
    // QZ Tray 的 setSignaturePromise 期望返回一个函数，该函数接收 (resolve, reject) 作为参数
    if (certs && certs.privateKey) {
      qz.security.setSignaturePromise(function(dataToSign) {
        // 返回一个函数，该函数接收 resolve 和 reject 作为参数
        return function(resolve, reject) {
          console.log('开始签名数据，长度:', dataToSign ? (typeof dataToSign === 'string' ? dataToSign.length : dataToSign.byteLength || 0) : 0);
          
          // 使用 async/await 包装签名过程
          (async function() {
            try {
              const signature = await signData(dataToSign);
              console.log('签名成功');
              resolve(signature);
            } catch (error) {
              console.error('签名失败:', error);
              reject(error);
            }
          })();
        };
      });
      
      // 设置签名算法为 SHA256（使用 qz.security 命名空间）
      qz.security.setSignatureAlgorithm('SHA256');
      console.log('✅ 签名处理器已配置（SHA256）');
    }
    
    // 连接到 QZ Tray
    await qz.websocket.connect().then(function() {
      qzInitialized = true;
      console.log('✅ QZ Tray 已连接（已配置证书签名，支持静默打印）');
      
      // 获取默认打印机
      return qz.printers.find();
    }).then(function(printers) {
      if (printers && printers.length > 0) {
        defaultPrinter = printers[0];
        console.log('默认打印机:', defaultPrinter);
      }
      return true;
    }).catch(function(err) {
      console.error('QZ Tray 连接错误:', err);
      qzInitialized = false;
      return false;
    });
    
    return qzInitialized;
  } catch (error) {
    console.error('QZ Tray 初始化错误:', error);
    return false;
  }
}

// 使用 QZ Tray 静默打印（HTML 格式）
async function printWithQZTray(receiptHtml, printerName = null) {
  try {
    const isConnected = await initQZTray();
    if (!isConnected) {
      return false;
    }
    
    const printer = printerName || defaultPrinter;
    if (!printer) {
      console.error('No printer available');
      return false;
    }
    
    // 创建打印配置（80mm 热敏打印机）
    const config = qz.configs.create(printer, {
      size: { width: 226.77, height: 841.89 }, // 80mm x 297mm
      units: 'mm',
      colorType: 'grayscale',
      margins: { top: 0, bottom: 0, left: 0, right: 0 }
    });
    
    // 将 HTML 转换为纯文本格式（热敏打印机通常需要纯文本或 ESC/POS）
    const text = convertHtmlToPlainText(receiptHtml);
    
    // 发送打印任务
    await qz.print(config, [text]);
    console.log('Print job sent via QZ Tray');
    return true;
  } catch (error) {
    console.error('QZ Tray print error:', error);
    return false;
  }
}

// 使用 QZ Tray 打印 HTML（直接打印 HTML 内容）
async function printHtmlWithQZTray(receiptHtml, printerName = null) {
  try {
    const isConnected = await initQZTray();
    if (!isConnected) {
      return false;
    }
    
    const printer = printerName || defaultPrinter;
    if (!printer) {
      console.error('No printer available');
      return false;
    }
    
    // 创建打印配置（80mm 热敏打印机）
    const config = qz.configs.create(printer, {
      size: { width: 226.77, height: 841.89 }, // 80mm
      units: 'mm',
      colorType: 'grayscale',
      margins: { top: 0, bottom: 0, left: 0, right: 0 }
    });
    
    // 直接打印 HTML
    await qz.print(config, [
      '<html><head><style>',
      'body { font-family: "Courier New", monospace; font-size: 13px; margin: 0; padding: 5mm; }',
      '.receipt-header { text-align: center; border-bottom: 2px dashed #000; padding-bottom: 8px; margin-bottom: 10px; }',
      '.receipt-store-name { font-size: 18px; font-weight: bold; }',
      '.receipt-order-info { font-size: 11px; margin: 8px 0; }',
      '.receipt-customer-info { font-size: 11px; margin: 8px 0; padding: 6px 0; border-top: 1px dashed #000; border-bottom: 1px dashed #000; }',
      '.receipt-item { margin: 8px 0; padding-bottom: 6px; border-bottom: 1px dotted #666; }',
      '.receipt-item-name { font-weight: bold; font-size: 13px; }',
      '.receipt-item-specs { font-size: 10px; color: #333; }',
      '.receipt-item-qty-price { text-align: right; font-size: 12px; font-weight: bold; }',
      '.receipt-divider { border-top: 1px dashed #000; margin: 10px 0; }',
      '.receipt-totals { margin: 10px 0; }',
      '.receipt-total-line { display: flex; justify-content: space-between; margin: 5px 0; font-size: 12px; }',
      '.receipt-total-final { font-weight: bold; font-size: 16px; border-top: 2px solid #000; padding-top: 6px; margin-top: 6px; }',
      '.receipt-footer { text-align: center; margin-top: 15px; padding-top: 10px; border-top: 1px dashed #000; }',
      '</style></head><body>',
      receiptHtml,
      '</body></html>'
    ]);
    
    console.log('HTML print job sent via QZ Tray');
    return true;
  } catch (error) {
    console.error('QZ Tray HTML print error:', error);
    return false;
  }
}

// 检查 WebPrint 是否可用
function isWebPrintAvailable() {
  // WebPrint 通常通过全局对象或特定 API 暴露
  return typeof window.WebPrint !== 'undefined' || 
         typeof window.webPrint !== 'undefined' ||
         navigator.userAgent.includes('WebPrint');
}

// 使用 WebPrint 静默打印
async function printWithWebPrint(receiptHtml) {
  try {
    if (!isWebPrintAvailable()) {
      return false;
    }
    
    const webPrint = window.WebPrint || window.webPrint;
    
    // WebPrint API 调用（根据实际 API 调整）
    if (typeof webPrint.print === 'function') {
      await webPrint.print(receiptHtml);
      return true;
    } else if (typeof webPrint.sendPrintJob === 'function') {
      await webPrint.sendPrintJob(receiptHtml);
      return true;
    } else if (typeof webPrint.printHtml === 'function') {
      await webPrint.printHtml(receiptHtml);
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('WebPrint error:', error);
    return false;
  }
}

// 将 HTML 转换为纯文本（用于热敏打印机）
function convertHtmlToPlainText(html) {
  // 创建一个临时 div 来解析 HTML
  const div = document.createElement('div');
  div.innerHTML = html;
  
  // 简单的文本提取
  let text = div.innerText || div.textContent || '';
  
  // 添加 ESC/POS 命令（如果需要）
  const escCommands = {
    init: '\x1B\x40',           // ESC @
    center: '\x1B\x61\x01',     // ESC a 1
    left: '\x1B\x61\x00',       // ESC a 0
    bold: '\x1B\x45\x01',       // ESC E 1
    normal: '\x1B\x45\x00',     // ESC E 0
    cut: '\x1D\x56\x41',        // GS V A (全切)
    lineFeed: '\x0A'            // LF
  };
  
  // 可以在这里添加格式化的 ESC/POS 命令
  // text = escCommands.init + text + escCommands.cut;
  
  return text;
}

// 统一的打印函数 - 自动选择最佳打印方式
async function silentPrint(receiptHtml, options = {}) {
  const { printerName, fallbackToWindowPrint = true, useHtmlPrint = true } = options;
  
  // 1. 尝试 QZ Tray（最常用）
  if (typeof qz !== 'undefined') {
    try {
      if (useHtmlPrint) {
        const qzSuccess = await printHtmlWithQZTray(receiptHtml, printerName);
        if (qzSuccess) {
          return { success: true, method: 'qztray' };
        }
      } else {
        const qzSuccess = await printWithQZTray(receiptHtml, printerName);
        if (qzSuccess) {
          return { success: true, method: 'qztray' };
        }
      }
    } catch (error) {
      console.error('QZ Tray print failed:', error);
    }
  }
  
  // 2. 尝试 WebPrint
  const webPrintSuccess = await printWithWebPrint(receiptHtml);
  if (webPrintSuccess) {
    return { success: true, method: 'webprint' };
  }
  
  // 3. 回退到标准打印对话框
  if (fallbackToWindowPrint) {
    return { success: false, method: 'fallback', requiresDialog: true };
  }
  
  return { success: false, method: 'none' };
}

