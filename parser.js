const puppeteer = require('puppeteer-extra');
const stealthPlugin = require('puppeteer-extra-plugin-stealth');
const config = require('./config');
const fs = require('fs').promises;
const path = require('path');

puppeteer.use(stealthPlugin());

class KnowledgeBaseParser {
    constructor() {
        this.browser = null;
        this.page = null;
        this.isAuthenticated = false;
        this.parsedArticles = new Map();
        this.stats = {
            total: 0,
            success: 0,
            failed: 0,
            skipped: 0
        };
    }

    async init() {
        console.log('🚀 Инициализация парсера...');
        
        try {
            this.browser = await puppeteer.launch({
                headless: config.BROWSER.HEADLESS,
                executablePath: config.BROWSER.EXECUTABLE_PATH,
                args: config.BROWSER.ARGS,
                defaultViewport: config.BROWSER.VIEWPORT
            });

            this.page = await this.browser.newPage();
            
            // Настройка таймаутов
            this.page.setDefaultTimeout(config.PARSER.TIMEOUT);
            this.page.setDefaultNavigationTimeout(config.PARSER.TIMEOUT);

            // Перехват console.log из браузера
            this.page.on('console', msg => {
                if (msg.type() === 'log') {
                    console.log(`[BROWSER]: ${msg.text()}`);
                }
            });

            // Обработка ошибок страницы
            this.page.on('pageerror', error => {
                console.error(`[PAGE ERROR]: ${error}`);
            });

            // Обработка запросов
            await this.page.setRequestInterception(true);
            this.page.on('request', (request) => {
                // Блокируем ненужные ресурсы для ускорения
                if (['image', 'stylesheet', 'font'].includes(request.resourceType())) {
                    request.abort();
                } else {
                    request.continue();
                }
            });

            console.log('✅ Браузер инициализирован');
        } catch (error) {
            console.error('❌ Ошибка инициализации браузера:', error);
            throw error;
        }
    }

    async authenticate() {
        console.log('🔐 Попытка авторизации...');
        
        try {
            await this.page.goto(config.PARSER.BASE_URL, {
                waitUntil: 'networkidle2'
            });

            // Ждем появления индикаторов авторизации
            await this.waitForAuth();

            this.isAuthenticated = true;
            console.log('✅ Авторизация успешна');
            return true;
        } catch (error) {
            console.error('❌ Ошибка авторизации:', error);
            return false;
        }
    }

    async waitForAuth() {
        console.log('⏳ Ожидание авторизации...');
        
        const authIndicators = config.SELECTORS.AUTH_INDICATORS;
        
        for (let attempt = 1; attempt <= config.PARSER.WAIT_FOR_AUTH_ATTEMPTS; attempt++) {
            try {
                // Проверяем различные индикаторы авторизации
                for (const selector of authIndicators) {
                    const element = await this.page.$(selector);
                    if (element) {
                        console.log(`✅ Найден индикатор авторизации: ${selector}`);
                        return true;
                    }
                }

                // Проверяем URL на наличие признаков авторизации
                const currentUrl = this.page.url();
                if (currentUrl.includes('dashboard') || 
                    currentUrl.includes('content') || 
                    !currentUrl.includes('login')) {
                    console.log('✅ URL указывает на успешную авторизацию');
                    return true;
                }

                console.log(`🔄 Попытка ${attempt}/${config.PARSER.WAIT_FOR_AUTH_ATTEMPTS} - авторизация не обнаружена`);
                await this.page.waitForTimeout(config.PARSER.AUTH_CHECK_INTERVAL);
                
            } catch (error) {
                console.log(`⚠️ Ошибка при проверке авторизации (попытка ${attempt}):`, error.message);
                await this.page.waitForTimeout(config.PARSER.AUTH_CHECK_INTERVAL);
            }
        }

        throw new Error('Не удалось подтвердить авторизацию в течение отведенного времени');
    }

    async searchArticle(articleTitle) {
        console.log(`🔍 Поиск статьи: "${articleTitle}"`);
        
        try {
            // Ожидаем появление поискового поля
            const searchSelector = 'input[type="search"], input[placeholder*="earch"], .search-input, #search';
            await this.page.waitForSelector(searchSelector, { timeout: 10000 });
            
            // Очищаем поле поиска и вводим запрос
            await this.page.click(searchSelector, { clickCount: 3 });
            await this.page.type(searchSelector, articleTitle, { delay: 100 });
            
            // Нажимаем Enter для поиска
            await this.page.keyboard.press('Enter');
            
            // Ждем результатов
            await this.page.waitForTimeout(3000);
            
            // Ищем ссылки на статьи в результатах поиска
            const articleLinks = await this.page.$$eval(config.SELECTORS.LINK_SELECTORS.join(','), 
                (links, title) => {
                    return links
                        .filter(link => {
                            const linkText = link.textContent.toLowerCase().trim();
                            const titleLower = title.toLowerCase().trim();
                            return linkText.includes(titleLower) || 
                                   titleLower.includes(linkText);
                        })
                        .map(link => ({
                            href: link.href,
                            text: link.textContent.trim(),
                            title: link.title || link.textContent.trim()
                        }));
                }, 
                articleTitle
            );

            if (articleLinks.length > 0) {
                console.log(`✅ Найдено ${articleLinks.length} результатов для "${articleTitle}"`);
                return articleLinks[0]; // Возвращаем первый результат
            } else {
                console.log(`❌ Статья не найдена: "${articleTitle}"`);
                return null;
            }

        } catch (error) {
            console.error(`❌ Ошибка поиска статьи "${articleTitle}":`, error);
            return null;
        }
    }

    async parseArticleContent(articleUrl) {
        console.log(`📖 Парсинг статьи: ${articleUrl}`);
        
        try {
            await this.page.goto(articleUrl, {
                waitUntil: 'networkidle2',
                timeout: config.PARSER.TIMEOUT
            });

            // Ждем загрузки контента
            await this.page.waitForTimeout(2000);

            // Прокручиваем страницу для загрузки всего контента
            await this.autoScroll();

            // Извлекаем заголовок
            const title = await this.extractTitle();
            
            // Извлекаем основной контент
            const content = await this.extractContent();
            
            // Извлекаем метаданные
            const metadata = await this.extractMetadata();

            return {
                title,
                content,
                metadata,
                url: articleUrl,
                timestamp: new Date().toISOString(),
                wordCount: content ? content.split(/\s+/).length : 0
            };

        } catch (error) {
            console.error(`❌ Ошибка парсинга статьи ${articleUrl}:`, error);
            return null;
        }
    }

    async extractTitle() {
        for (const selector of config.SELECTORS.TITLE_SELECTORS) {
            try {
                const titleElement = await this.page.$(selector);
                if (titleElement) {
                    const title = await this.page.evaluate(el => el.textContent.trim(), titleElement);
                    if (title && title.length > 0) {
                        return title;
                    }
                }
            } catch (error) {
                // Продолжаем пробовать следующий селектор
                continue;
            }
        }
        return 'Заголовок не найден';
    }

    async extractContent() {
        let content = '';
        
        for (const selector of config.SELECTORS.CONTENT_SELECTORS) {
            try {
                const contentElements = await this.page.$$(selector);
                for (const element of contentElements) {
                    const elementContent = await this.page.evaluate(el => {
                        // Очищаем текст от лишних пробелов и переносов
                        return el.textContent
                            .replace(/\s+/g, ' ')
                            .replace(/\n+/g, '\n')
                            .trim();
                    }, element);
                    
                    if (elementContent && elementContent.length > 50) { // Минимальная длина контента
                        content += elementContent + '\n\n';
                    }
                }
            } catch (error) {
                continue;
            }
        }

        return content.trim() || 'Контент не найден';
    }

    async extractMetadata() {
        try {
            // Извлекаем различные метаданные со страницы
            const metadata = await this.page.evaluate(() => {
                const metaTags = {};
                const metaElements = document.querySelectorAll('meta[name], meta[property]');
                
                metaElements.forEach(meta => {
                    const name = meta.getAttribute('name') || meta.getAttribute('property');
                    const content = meta.getAttribute('content');
                    if (name && content) {
                        metaTags[name] = content;
                    }
                });

                // Извлекаем дату последнего изменения
                const lastModified = document.lastModified || new Date().toISOString();
                
                // Извлекаем язык страницы
                const language = document.documentElement.lang || 'ru';

                return {
                    metaTags,
                    lastModified,
                    language,
                    url: window.location.href
                };
            });

            return metadata;
        } catch (error) {
            console.error('Ошибка извлечения метаданных:', error);
            return {};
        }
    }

    async autoScroll() {
        await this.page.evaluate(async (scrollDelay) => {
            await new Promise((resolve) => {
                let totalHeight = 0;
                const distance = 100;
                const timer = setInterval(() => {
                    const scrollHeight = document.body.scrollHeight;
                    window.scrollBy(0, distance);
                    totalHeight += distance;

                    if (totalHeight >= scrollHeight) {
                        clearInterval(timer);
                        resolve();
                    }
                }, scrollDelay);
            });
        }, config.PARSER.SCROLL_DELAY);
    }

    async saveArticle(articleData, filename = null) {
        try {
            const dataDir = config.FILES.DATA_DIR;
            await fs.mkdir(dataDir, { recursive: true });

            if (!filename) {
                // Создаем безопасное имя файла из заголовка
                filename = articleData.title
                    .toLowerCase()
                    .replace(/[^a-z0-9а-яё]/g, '_')
                    .replace(/_+/g, '_')
                    .substring(0, 100) + '.json';
            }

            const filePath = path.join(dataDir, filename);
            
            // Сохраняем в JSON формате
            await fs.writeFile(
                filePath, 
                JSON.stringify(articleData, null, 2), 
                'utf8'
            );

            console.log(`💾 Статья сохранена: ${filePath}`);
            return filePath;

        } catch (error) {
            console.error('❌ Ошибка сохранения статьи:', error);
            throw error;
        }
    }

    async parseAllArticles(articlesList, options = {}) {
        const {
            delay = config.PARSER.ARTICLE_PARSE_DELAY,
            maxArticles = null,
            skipExisting = true
        } = options;

        console.log(`🎯 Начало парсинга ${maxArticles || articlesList.length} статей`);
        
        this.stats.total = maxArticles ? Math.min(maxArticles, articlesList.length) : articlesList.length;
        
        for (let i = 0; i < articlesList.length; i++) {
            if (maxArticles && i >= maxArticles) break;

            const articleTitle = articlesList[i];
            console.log(`\n--- [${i + 1}/${this.stats.total}] ${articleTitle} ---`);

            try {
                // Проверяем, не парсили ли мы уже эту статью
                if (skipExisting && this.parsedArticles.has(articleTitle)) {
                    console.log('⏭️ Статья уже обработана, пропускаем');
                    this.stats.skipped++;
                    continue;
                }

                // Поиск статьи
                const articleLink = await this.searchArticle(articleTitle);
                if (!articleLink) {
                    console.log('❌ Статья не найдена');
                    this.stats.failed++;
                    continue;
                }

                // Парсинг контента
                const articleContent = await this.parseArticleContent(articleLink.href);
                if (!articleContent) {
                    console.log('❌ Не удалось извлечь контент статьи');
                    this.stats.failed++;
                    continue;
                }

                // Сохранение
                await this.saveArticle(articleContent);
                this.parsedArticles.set(articleTitle, articleContent);
                this.stats.success++;

                // Задержка между запросами
                if (delay > 0 && i < articlesList.length - 1) {
                    console.log(`⏳ Ожидание ${delay}ms...`);
                    await this.page.waitForTimeout(delay);
                }

            } catch (error) {
                console.error(`❌ Критическая ошибка при обработке статьи:`, error);
                this.stats.failed++;
                
                // Продолжаем обработку следующих статей
                continue;
            }
        }

        this.printStats();
        return this.stats;
    }

    printStats() {
        console.log('\n📊 ========== СТАТИСТИКА ПАРСИНГА ==========');
        console.log(`📈 Всего статей: ${this.stats.total}`);
        console.log(`✅ Успешно: ${this.stats.success}`);
        console.log(`❌ Ошибки: ${this.stats.failed}`);
        console.log(`⏭️ Пропущено: ${this.stats.skipped}`);
        console.log(`📊 Эффективность: ${((this.stats.success / this.stats.total) * 100).toFixed(2)}%`);
        console.log('==========================================\n');
    }

    async exportToCSV() {
        try {
            const dataDir = config.FILES.DATA_DIR;
            const csvPath = path.join(dataDir, 'articles_export.csv');
            
            let csvContent = 'Title,URL,Word Count,Timestamp\n';
            
            for (const [title, article] of this.parsedArticles) {
                const row = [
                    `"${title.replace(/"/g, '""')}"`,
                    `"${article.url}"`,
                    article.wordCount,
                    article.timestamp
                ].join(',');
                
                csvContent += row + '\n';
            }

            await fs.writeFile(csvPath, csvContent, 'utf8');
            console.log(`📊 CSV экспорт создан: ${csvPath}`);
            
            return csvPath;
        } catch (error) {
            console.error('❌ Ошибка экспорта в CSV:', error);
            throw error;
        }
    }

    async close() {
        if (this.browser) {
            await this.browser.close();
            console.log('🔚 Браузер закрыт');
        }
    }

    // Метод для обработки ошибок с повторными попытками
    async retryOperation(operation, maxAttempts = config.PARSER.RETRY_ATTEMPTS) {
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                return await operation();
            } catch (error) {
                console.log(`🔄 Попытка ${attempt}/${maxAttempts} не удалась:`, error.message);
                
                if (attempt === maxAttempts) {
                    throw error;
                }
                
                // Экспоненциальная задержка
                const delay = Math.min(1000 * Math.pow(2, attempt), 30000);
                console.log(`⏳ Повторная попытка через ${delay}ms...`);
                await this.page.waitForTimeout(delay);
            }
        }
    }
}

module.exports = KnowledgeBaseParser;
