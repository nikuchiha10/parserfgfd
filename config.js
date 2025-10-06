module.exports = {
  // Telegram Bot Configuration
  TELEGRAM: {
    TOKEN: "7220498387:AAEPlB9BLtTdmzUtRoD2pXhsoB3UzsnoMzE",
    CHAT_ID: "6910167987",
    ADMIN_IDS: ["6910167987"],
    OPTIONS: {
      polling: true,
      timeout: 30
    }
  },

  // Browser Configuration
  BROWSER: {
    HEADLESS: false,
    EXECUTABLE_PATH: '/usr/bin/google-chrome',
    ARGS: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--window-size=1920,1080',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu',
      '--disable-web-security',
      '--disable-features=site-per-process',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding'
    ],
    VIEWPORT: {
      width: 1920,
      height: 1080
    }
  },

  // Parser Configuration
  PARSER: {
    BASE_URL: 'https://mes1-kms.interrao.ru/content/space/4',
    TIMEOUT: 60000,
    WAIT_FOR_AUTH_ATTEMPTS: 60,
    AUTH_CHECK_INTERVAL: 5000,
    ARTICLE_PARSE_DELAY: 2000,
    SCROLL_DELAY: 100,
    MAX_CONCURRENT_PAGES: 3,
    RETRY_ATTEMPTS: 3
  },

  // Selectors for parsing
  SELECTORS: {
    AUTH_INDICATORS: [
      '[href*="logout"]',
      '.user-menu',
      '.user-info',
      '.logout',
      '[class*="user"]',
      '[class*="profile"]',
      '.auth-user',
      '.user-profile'
    ],
    CONTENT_SELECTORS: [
      'article',
      '.article-content',
      '.content',
      '.post-content',
      '.main-content',
      '.body-content',
      '.text-content',
      '[class*="content"]',
      '[class*="article"]',
      '[class*="post"]',
      '.main-content',
      '.body',
      '.text',
      '.document-content',
      '.page-content'
    ],
    TITLE_SELECTORS: [
      'h1',
      'h2',
      '.title',
      '.header',
      '.page-title',
      '.article-title',
      '.post-title',
      '[class*="title"]',
      '[class*="header"]'
    ],
    LINK_SELECTORS: [
      'a[href*="/content/"]',
      '.article-list a',
      '.content-list a',
      '.items-list a',
      '[class*="item"] a',
      '.list-item a'
    ]
  },

  // File Configuration
  FILES: {
    DATA_DIR: './data',
    BACKUP_DIR: './backups',
    LOGS_DIR: './logs',
    MAX_FILE_SIZE: 50 * 1024 * 1024, // 50MB
    BACKUP_RETENTION_DAYS: 7
  },

  // Performance Configuration
  PERFORMANCE: {
    MEMORY_MONITORING: true,
    CPU_THRESHOLD: 80,
    MEMORY_THRESHOLD: 512, // MB
    AUTO_RESTART: true
  }
};
